import { useMemo } from "react";
import {
  balanceFromLedger,
  computeCockpit,
  computePlan,
  type CockpitData,
  type LedgerTransaction,
} from "@fc/engine/cockpit";
import { DEFAULT_SETTINGS, type Cents, type Projection } from "@fc/shared";
import { CockpitView } from "./Cockpit.js";

const YEAR = 2026;
const AS_OF = "2026-07-15";
const eur = (n: number) => (n * 100) as Cents;

/** Fictitious freelance year: computed in the browser, nothing is written. */
function demoData(): CockpitData {
  const timeline = [{ validFrom: "2026-01-01", settings: { ...DEFAULT_SETTINGS } }];
  const projection: Projection = {
    year: YEAR,
    tjm: eur(450),
    joursParMois: Array<number>(12).fill(17),
    fraisMensuels: eur(120),
    conges: ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"],
    joursDepuisCalendrier: true,
  };
  const encaisse = [6300, 7650, 8100, 5400, 7200, 8550, 3600];
  const transactions: LedgerTransaction[] = [];
  let id = 1;
  encaisse.forEach((amount, i) => {
    const m = String(i + 1).padStart(2, "0");
    transactions.push({
      id: id++,
      date: `2026-${m}-05`,
      amount: eur(amount),
      kind: "encaissement",
      vatAmount: eur(0),
    });
    transactions.push({
      id: id++,
      date: `2026-${m}-12`,
      amount: eur(-120),
      kind: "frais_pro",
      vatAmount: eur(0),
    });
  });
  const computation = computeCockpit({
    year: YEAR,
    asOf: AS_OF,
    transactions,
    projection,
    timeline,
  });
  // Urssaf deadlines due before the demo date are paid.
  const deadlines = computation.urssafDeadlines.map((d, i) => ({
    id: i + 1,
    kind: "urssaf",
    label: `Urssaf : ${d.periodStart.slice(0, 7)}`,
    dueOn: d.dueOn,
    amountDue: d.amountDue,
    paidOn: d.dueOn < AS_OF ? d.dueOn : null,
  }));
  for (const d of deadlines) {
    if (d.paidOn !== null) {
      transactions.push({
        id: id++,
        date: d.paidOn,
        amount: (0 - d.amountDue) as Cents,
        kind: "paiement_echeance",
        vatAmount: eur(0),
      });
    }
  }
  const balance = balanceFromLedger(
    { date: "2025-12-31", amount: eur(9000) },
    transactions,
    computation.provisions,
  );
  const next = deadlines.find((d) => d.paidOn === null && d.amountDue > 0) ?? null;
  return {
    year: YEAR,
    asOf: AS_OF,
    balance,
    coverage: {
      ratio: balance.provisionsUnpaid > 0 ? balance.balance / balance.provisionsUnpaid : null,
      next:
        next === null
          ? null
          : { label: next.label, kind: next.kind, dueOn: next.dueOn, amount: next.amountDue },
    },
    realised: computation.realised,
    projected: computation.projected,
    plan: computePlan(YEAR, projection, timeline),
    deadlines,
  };
}

export default function Demo() {
  const data = useMemo(() => demoData(), []);
  return (
    <div className="stack">
      <p className="demo-banner">
        Mode démo : données fictives calculées dans le navigateur, rien n'est enregistré.
      </p>
      <CockpitView data={data} />
    </div>
  );
}
