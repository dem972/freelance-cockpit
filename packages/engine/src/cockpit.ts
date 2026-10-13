// Real mode: provisions per transaction and Urssaf deadlines, from the same
// engine as the simulator. Pure: "today" is the `asOf` parameter.
import type {
  Cents,
  IsoDate,
  Projection,
  ProvisionKind,
  SettingsTimeline,
  TransactionKind,
} from "@fc/shared";
import { joursPrevus } from "./conges.js";
import { monthStart, parseIso } from "./dates.js";
import { periodesUrssaf } from "./echeances.js";
import { applyRate } from "./money.js";
import { getRateTable } from "./rates.js";
import { settingsAt } from "./settings.js";
import { computeStatut, MODELE_SOCIAL_VERSION } from "./societe.js";
import type { Breakdown, MonthInput } from "./types.js";

export interface LedgerTransaction {
  id: number;
  date: IsoDate;
  amount: Cents;
  kind: TransactionKind;
  vatAmount: Cents;
}

export interface CockpitInput {
  year: number;
  /** Last day considered as "realised"; later months use the projection. */
  asOf: IsoDate;
  transactions: LedgerTransaction[];
  projection: Projection | null;
  timeline: SettingsTimeline;
}

export interface ProvisionLine {
  transactionId: number;
  kind: ProvisionKind;
  amount: Cents;
}

export interface UrssafDeadline {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  dueOn: IsoDate;
  amountDue: Cents;
}

export interface CockpitComputation {
  rateVersion: string;
  /** Realised months + projected months: the year as it is expected to end. */
  projected: Breakdown;
  /** Realised months only (zero afterwards). */
  realised: Breakdown;
  provisions: ProvisionLine[];
  urssafDeadlines: UrssafDeadline[];
}

/** FNV-1a, enough to tell two rate tables apart. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Identifies the rates a provision was computed with, to replay it later. */
export function rateVersion(year: number): string {
  return `${String(year)}-${hash(JSON.stringify(getRateTable(year)))}-ms${MODELE_SOCIAL_VERSION}`;
}

export const htOf = (t: Pick<LedgerTransaction, "amount" | "vatAmount" | "kind">): number =>
  t.kind === "encaissement" ? t.amount - t.vatAmount : 0 - t.amount - t.vatAmount;

/** Last realised month of `year` (0 = none, 12 = all). */
function lastRealisedMonth(year: number, asOf: IsoDate): number {
  const { year: y, month } = parseIso(asOf);
  if (y < year) return 0;
  if (y > year) return 12;
  return month;
}

export function actualMonths(year: number, transactions: LedgerTransaction[]): MonthInput[] {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ca: 0, fraisPro: 0 }));
  for (const t of transactions) {
    const { year: y, month } = parseIso(t.date);
    const m = months[month - 1];
    if (y !== year || m === undefined) continue;
    if (t.kind === "encaissement") m.ca += htOf(t);
    if (t.kind === "frais_pro") m.fraisPro += htOf(t);
  }
  return months as MonthInput[];
}

export function projectedMonths(projection: Projection | null): MonthInput[] {
  return Array.from({ length: 12 }, (_, i) => {
    if (projection === null) return { month: i + 1, ca: 0 as Cents, fraisPro: 0 as Cents };
    const jours = joursPrevus(projection)[i] ?? 0;
    return {
      month: i + 1,
      ca: Math.round(projection.tjm * jours) as Cents,
      fraisPro: projection.fraisMensuels,
    };
  });
}

export function computeCockpit(input: CockpitInput): CockpitComputation {
  const { year, timeline } = input;
  const statut = settingsAt(timeline, monthStart(year, 1)).statut;
  const last = lastRealisedMonth(year, input.asOf);
  const actual = actualMonths(year, input.transactions);
  const forecast = projectedMonths(input.projection);
  const merged = actual.map((m, i) => (m.month <= last ? m : (forecast[i] ?? m)));
  const realisedOnly = actual.map((m) =>
    m.month <= last ? m : { month: m.month, ca: 0 as Cents, fraisPro: 0 as Cents },
  );

  const projected = computeStatut({ year, months: merged, timeline }, statut);
  const realised = computeStatut({ year, months: realisedOnly, timeline }, statut);

  // Provision rates per month come from the projected year, so the income tax
  // is provisioned at the rate expected for the whole year.
  const provisions: ProvisionLine[] = [];
  const add = (transactionId: number, kind: ProvisionKind, amount: number) => {
    if (amount !== 0) provisions.push({ transactionId, kind, amount: Math.round(amount) as Cents });
  };
  for (const t of input.transactions) {
    const { year: y, month } = parseIso(t.date);
    if (y !== year) continue;
    const m = projected.months[month - 1];
    if (m === undefined) continue;
    const settings = settingsAt(timeline, monthStart(year, month));
    if (t.kind === "encaissement") {
      const ht = htOf(t) as Cents;
      if (m.ca > 0) {
        add(t.id, "urssaf", applyRate(ht, m.cotisations / m.ca));
        add(t.id, "cfp", applyRate(ht, m.cfp / m.ca));
        add(t.id, "impot", applyRate(ht, m.impot / m.ca));
      }
      add(t.id, "tva", t.vatAmount);
    } else if (t.kind === "frais_pro" && settings.tva === "assujetti") {
      add(t.id, "tva", 0 - t.vatAmount);
    }
  }

  // Urssaf deadlines (micro only): cotisations + CFP, + VFL when opted.
  const urssafDeadlines: UrssafDeadline[] = [];
  if (statut === "micro_bnc") {
    const periodicite = settingsAt(timeline, monthStart(year, 1)).periodiciteUrssaf;
    const byTx = new Map(input.transactions.map((t) => [t.id, t]));
    for (const p of periodesUrssaf(year, periodicite)) {
      let due = 0;
      for (const line of provisions) {
        const t = byTx.get(line.transactionId);
        if (t === undefined || t.date < p.start || t.date > p.end) continue;
        const vl = settingsAt(timeline, t.date).versementLiberatoire;
        if (line.kind === "urssaf" || line.kind === "cfp" || (line.kind === "impot" && vl)) {
          due += line.amount;
        }
      }
      if (due > 0 || p.end <= input.asOf) {
        urssafDeadlines.push({
          periodStart: p.start,
          periodEnd: p.end,
          dueOn: p.dueOn,
          amountDue: due as Cents,
        });
      }
    }
  }

  return { rateVersion: rateVersion(year), projected, realised, provisions, urssafDeadlines };
}

export interface CockpitBalance {
  snapshotDate: IsoDate | null;
  balance: Cents;
  provisionsUnpaid: Cents;
  available: Cents;
}

export interface CockpitCoverage {
  /** balance / unpaid provisions; null when nothing is owed. */
  ratio: number | null;
  next: { label: string; kind: string; dueOn: IsoDate; amount: Cents } | null;
}

export interface CockpitDeadline {
  id: number;
  kind: string;
  label: string;
  dueOn: IsoDate;
  amountDue: Cents;
  paidOn: IsoDate | null;
}

/** Everything the cockpit screen shows, from the API or built locally in demo mode. */
export interface CockpitData {
  year: number;
  asOf: IsoDate;
  balance: CockpitBalance;
  coverage: CockpitCoverage;
  /** Realised months only. */
  realised: Breakdown;
  /** Realised months + forecast for the rest of the year. */
  projected: Breakdown;
  /** Forecast alone for the whole year (the plan). */
  plan: Breakdown;
  deadlines: CockpitDeadline[];
}

/** The plan: the projection alone over the whole year. */
export function computePlan(
  year: number,
  projection: Projection | null,
  timeline: SettingsTimeline,
) {
  const statut = settingsAt(timeline, monthStart(year, 1)).statut;
  return computeStatut({ year, months: projectedMonths(projection), timeline }, statut);
}

/**
 * Same rules as the SQL view v_available_balance, for demo mode (no database):
 * balance = last snapshot + later movements; unpaid = provisions − payments.
 */
export function balanceFromLedger(
  snapshot: { date: IsoDate; amount: Cents } | null,
  transactions: LedgerTransaction[],
  provisions: ProvisionLine[],
): CockpitBalance {
  const moves = transactions
    .filter((t) => snapshot === null || t.date > snapshot.date)
    .reduce((a, t) => a + t.amount, 0);
  const provisioned = provisions.reduce((a, p) => a + p.amount, 0);
  const paid = transactions
    .filter((t) => t.kind === "paiement_echeance")
    .reduce((a, t) => a - t.amount, 0);
  const balance = (snapshot?.amount ?? 0) + moves;
  const unpaid = Math.max(0, provisioned - paid);
  return {
    snapshotDate: snapshot?.date ?? null,
    balance: balance as Cents,
    provisionsUnpaid: unpaid as Cents,
    available: (balance - unpaid) as Cents,
  };
}
