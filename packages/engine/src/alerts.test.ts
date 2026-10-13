import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Cents, type Projection, type Settings } from "@fc/shared";
import { computeAlerts } from "./alerts.js";
import {
  balanceFromLedger,
  computeCockpit,
  computePlan,
  type CockpitData,
  type CockpitDeadline,
  type LedgerTransaction,
} from "./cockpit.js";

const eur = (n: number) => (n * 100) as Cents;

function data(opts: {
  asOf: string;
  balance: number;
  transactions?: LedgerTransaction[];
  deadlines?: CockpitDeadline[];
  projection?: Projection | null;
  settings?: Partial<Settings>;
}): CockpitData {
  const timeline = [
    { validFrom: "2026-01-01", settings: { ...DEFAULT_SETTINGS, ...opts.settings } },
  ];
  const transactions = opts.transactions ?? [];
  const projection = opts.projection ?? null;
  const c = computeCockpit({ year: 2026, asOf: opts.asOf, transactions, projection, timeline });
  return {
    year: 2026,
    asOf: opts.asOf,
    balance: balanceFromLedger(
      { date: "2025-12-31", amount: eur(opts.balance) },
      transactions,
      c.provisions,
    ),
    coverage: { ratio: null, next: null },
    realised: c.realised,
    projected: c.projected,
    plan: computePlan(2026, projection, timeline),
    deadlines: opts.deadlines ?? [],
  };
}

const enc = (id: number, date: string, amount: number): LedgerTransaction => ({
  id,
  date,
  amount: eur(amount),
  kind: "encaissement",
  vatAmount: eur(0),
});
const deadline = (id: number, dueOn: string, amount: number): CockpitDeadline => ({
  id,
  kind: "urssaf",
  label: `Urssaf ${String(id)}`,
  dueOn,
  amountDue: eur(amount),
  paidOn: null,
});
const codes = (d: CockpitData) =>
  computeAlerts(d).map((a) => `${a.severity}:${a.key.split("-").slice(0, 2).join("-")}`);

describe("computeAlerts", () => {
  it("no data, no alert", () => {
    expect(computeAlerts(data({ asOf: "2026-03-15", balance: 0 }))).toEqual([]);
  });

  it("critical when the balance does not cover unpaid provisions", () => {
    // 10 000 € cashed, balance forced low by a 9 000 € withdrawal.
    const d = data({
      asOf: "2026-03-15",
      balance: 0,
      transactions: [
        enc(1, "2026-02-01", 10_000),
        { id: 2, date: "2026-02-02", amount: eur(-9_000), kind: "autre", vatAmount: eur(0) },
      ],
    });
    expect(codes(d)).toContain("critical:coverage-low");
  });

  it("deadlines: late is critical, soon is warning, far is silent, zero is ignored", () => {
    const d = data({
      asOf: "2026-03-15",
      balance: 50_000,
      deadlines: [
        deadline(1, "2026-03-02", 500),
        deadline(2, "2026-03-20", 500),
        deadline(3, "2026-05-31", 500),
        deadline(4, "2026-03-01", 0),
      ],
    });
    const keys = computeAlerts(d).map((a) => `${a.severity}:${a.key}`);
    expect(keys).toContain("critical:deadline-late-1");
    expect(keys).toContain("warning:deadline-soon-2");
    expect(keys.some((k) => k.endsWith("-3") || k.endsWith("-4"))).toBe(false);
  });

  it("soon deadline becomes critical when the balance cannot pay it", () => {
    const d = data({
      asOf: "2026-03-15",
      balance: 100,
      deadlines: [deadline(2, "2026-03-20", 500)],
    });
    expect(computeAlerts(d).find((a) => a.key === "deadline-soon-2")?.severity).toBe("critical");
  });

  it("projected thresholds: TVA seuil majoré and micro ceiling", () => {
    const projection: Projection = {
      year: 2026,
      tjm: eur(600),
      joursParMois: Array<number>(12).fill(15),
      fraisMensuels: eur(0),
      conges: [],
      joursDepuisCalendrier: false,
    };
    const d = data({ asOf: "2026-01-15", balance: 10_000, projection });
    const c = codes(d);
    expect(c).toContain("warning:tva-majore");
    expect(c).toContain("warning:plafond-micro");
  });

  it("Acre ending within 60 days", () => {
    const d = data({
      asOf: "2026-11-15",
      balance: 10_000,
      settings: { acreDebutActivite: "2026-02-10" },
      transactions: [enc(1, "2026-11-01", 1_000)],
    });
    expect(codes(d)).toContain("info:acre-fin");
  });

  it("behind plan by more than 20 %", () => {
    const projection: Projection = {
      year: 2026,
      tjm: eur(500),
      joursParMois: Array<number>(12).fill(10),
      fraisMensuels: eur(0),
      conges: [],
      joursDepuisCalendrier: false,
    };
    const d = data({
      asOf: "2026-04-10",
      balance: 10_000,
      projection,
      transactions: [enc(1, "2026-01-10", 2_000)],
    });
    expect(codes(d)).toContain("info:behind-plan");
  });

  it("orders critical first", () => {
    const d = data({
      asOf: "2026-03-15",
      balance: 100,
      deadlines: [deadline(1, "2026-03-02", 500), deadline(2, "2026-03-20", 50)],
    });
    expect(computeAlerts(d)[0]?.severity).toBe("critical");
  });
});
