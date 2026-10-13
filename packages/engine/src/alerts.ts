// Deterministic alerts from the cockpit data. No AI: each rule is a plain
// comparison, testable, and its key changes when the situation changes (so a
// dismissed alert comes back if it gets worse).
import type { IsoDate } from "@fc/shared";
import type { CockpitData } from "./cockpit.js";

export type AlertSeverity = "critical" | "warning" | "info";

export interface Alert {
  /** Stable for a given situation; used to dismiss it. */
  key: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** Where to act in the app. */
  route: "/cockpit" | "/saisie" | "/reglages" | "/simulateur";
}

const DAY = 86_400_000;
const days = (from: IsoDate, to: IsoDate) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const frDate = (iso: IsoDate) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export interface AlertOptions {
  /** Deadlines due within this many days raise a warning. */
  deadlineSoonDays?: number;
  /** Acre ending within this many days raises an info. */
  acreSoonDays?: number;
  /** Realised CA below the plan by more than this share raises an info. */
  behindPlanRatio?: number;
}

export function computeAlerts(data: CockpitData, options: AlertOptions = {}): Alert[] {
  const { deadlineSoonDays = 10, acreSoonDays = 60, behindPlanRatio = 0.2 } = options;
  const alerts: Alert[] = [];
  const { asOf } = data;

  // 1. The bank balance does not cover what must be set aside.
  const { balance, provisionsUnpaid, available } = data.balance;
  if (provisionsUnpaid > 0 && balance < provisionsUnpaid) {
    alerts.push({
      key: `coverage-low-${String(Math.round(available / 10_000))}`,
      severity: "critical",
      title: "Solde insuffisant pour tes provisions",
      message: `Il manque ${euros(provisionsUnpaid - balance)} pour couvrir les ${euros(provisionsUnpaid)} à mettre de côté.`,
      route: "/cockpit",
    });
  }

  // 2. Deadlines: overdue, then due soon (amounts > 0 only).
  for (const d of data.deadlines) {
    if (d.paidOn !== null || d.amountDue <= 0) continue;
    const left = days(asOf, d.dueOn);
    if (left < 0) {
      alerts.push({
        key: `deadline-late-${String(d.id)}`,
        severity: "critical",
        title: `${d.label} : en retard`,
        message: `${euros(d.amountDue)} à payer depuis le ${frDate(d.dueOn)} (${String(-left)} j). Marque-la payée si c'est fait.`,
        route: "/saisie",
      });
    } else if (left <= deadlineSoonDays) {
      const short = balance < d.amountDue;
      alerts.push({
        key: `deadline-soon-${String(d.id)}`,
        severity: short ? "critical" : "warning",
        title: `${d.label} dans ${String(left)} j`,
        message: short
          ? `${euros(d.amountDue)} à payer le ${frDate(d.dueOn)}, mais le solde n'est que de ${euros(balance)}.`
          : `${euros(d.amountDue)} à payer le ${frDate(d.dueOn)}.`,
        route: "/saisie",
      });
    }
  }

  // 3. Thresholds expected to be crossed by year end (from the projection).
  for (const w of data.projected.warnings) {
    if (w.code === "tva_seuil_majore_depasse") {
      alerts.push({
        key: `tva-majore-${String(data.year)}-${String(w.month ?? 0)}`,
        severity: "warning",
        title: "Seuil majoré de TVA bientôt franchi",
        message: `D'après le prévisionnel, la franchise de TVA tombe en cours d'année${w.month === undefined ? "" : ` (mois ${String(w.month)})`} : TVA à facturer dès le jour du dépassement.`,
        route: "/reglages",
      });
    }
    if (w.code === "tva_seuil_depasse") {
      alerts.push({
        key: `tva-seuil-${String(data.year)}`,
        severity: "info",
        title: "Franchise de TVA perdue l'an prochain",
        message: "Le CA projeté dépasse le seuil de franchise : TVA due au 1er janvier suivant.",
        route: "/reglages",
      });
    }
    if (w.code === "plafond_micro_depasse") {
      alerts.push({
        key: `plafond-micro-${String(data.year)}`,
        severity: "warning",
        title: "Plafond micro dépassé sur l'année",
        message:
          "Le CA projeté dépasse le plafond de la micro-entreprise. Deux années de suite : sortie du régime. Compare les statuts dans le simulateur.",
        route: "/simulateur",
      });
    }
  }

  // 4. Acre ending soon.
  const acre = data.projected.acre;
  if (acre !== undefined) {
    const left = days(asOf, acre.fin);
    if (left >= 0 && left <= acreSoonDays) {
      alerts.push({
        key: `acre-fin-${acre.fin}`,
        severity: "info",
        title: `Fin de l'Acre dans ${String(left)} j`,
        message: `Taux plein à partir du lendemain du ${frDate(acre.fin)} : tes provisions vont augmenter.`,
        route: "/cockpit",
      });
    }
  }

  // 5. Behind plan.
  const lastMonth = asOf.startsWith(String(data.year)) ? Number(asOf.slice(5, 7)) : 0;
  const planToDate = data.plan.months
    .filter((m) => m.month < lastMonth)
    .reduce((a, m) => a + m.ca, 0);
  const realisedToDate = data.realised.months
    .filter((m) => m.month < lastMonth)
    .reduce((a, m) => a + m.ca, 0);
  if (planToDate > 0 && realisedToDate < planToDate * (1 - behindPlanRatio)) {
    alerts.push({
      key: `behind-plan-${String(data.year)}-${String(lastMonth)}`,
      severity: "info",
      title: "CA en retard sur le prévisionnel",
      message: `${euros(realisedToDate)} encaissés sur les mois écoulés, contre ${euros(planToDate)} prévus.`,
      route: "/reglages",
    });
  }

  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
