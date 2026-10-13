import type { CockpitData } from "@fc/engine/cockpit";
import { AcreCard } from "../components/AcreCard.js";
import { BreakdownBar } from "../components/BreakdownBar.js";
import { CoverageRing } from "../components/CoverageRing.js";
import { ErrorText } from "../components/ErrorText.js";
import { MonthlyChart } from "../components/MonthlyChart.js";
import { RatesPanel } from "../components/RatesPanel.js";
import { Warnings } from "../components/Warnings.js";
import { useApi } from "../lib/api.js";
import { date, eur } from "../lib/format.js";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card kpi">
      <p className="label">{label}</p>
      <p className="value num">{value}</p>
      {sub !== undefined && <p className="sub">{sub}</p>}
    </div>
  );
}

/** The cockpit screen; data comes from the API (real) or is built locally (demo). */
export function CockpitView({ data }: { data: CockpitData }) {
  const lastMonth = data.asOf.startsWith(String(data.year))
    ? Number(data.asOf.slice(5, 7))
    : data.asOf < `${String(data.year)}-01-01`
      ? 0
      : 12;
  const planToDate = data.plan.months
    .filter((m) => m.month <= lastMonth)
    .reduce((a, m) => a + m.ca, 0);
  const upcoming = data.deadlines.filter((d) => d.paidOn === null);
  const monthly = data.realised.months.map((m, i) => ({
    month: m.month,
    realise: m.month <= lastMonth ? m.ca : null,
    plan: data.plan.months[i]?.ca ?? 0,
  }));

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi
          label="Solde disponible"
          value={eur(data.balance.available)}
          sub="Solde − provisions non payées"
        />
        <Kpi
          label="Solde bancaire"
          value={eur(data.balance.balance)}
          {...(data.balance.snapshotDate === null
            ? { sub: "Aucun relevé saisi : somme des mouvements" }
            : { sub: `Relevé du ${date(data.balance.snapshotDate)} + mouvements` })}
        />
        <Kpi
          label={`CA réalisé ${String(data.year)}`}
          value={eur(data.realised.ca)}
          sub={`Prévu à date : ${eur(planToDate)} (${data.realised.ca >= planToDate ? "+" : ""}${eur(data.realised.ca - planToDate)})`}
        />
        <Kpi
          label="Net projeté fin d'année"
          value={eur(data.projected.net)}
          sub={`Réalisé : ${eur(data.realised.net)} · Plan : ${eur(data.plan.net)}`}
        />
      </div>

      <div className="layout">
        <CoverageRing coverage={data.coverage} unpaid={data.balance.provisionsUnpaid} />
        <section className="card">
          <h3>Projection fin d'année</h3>
          <p className="muted small">Réalisé jusqu'au {date(data.asOf)}, prévisionnel ensuite.</p>
          <BreakdownBar b={data.projected} />
          <Warnings warnings={data.projected.warnings} />
        </section>
      </div>

      {data.projected.acre !== undefined && (
        <AcreCard acre={data.projected.acre} asOf={data.asOf} />
      )}

      <MonthlyChart data={monthly} title="CA HT par mois : réalisé et prévisionnel" />

      <section className="card">
        <h3>Échéancier</h3>
        {upcoming.length === 0 ? (
          <p className="muted">Rien à payer.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Échéance</th>
                  <th>Libellé</th>
                  <th>Montant</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((d) => (
                  <tr key={d.id}>
                    <td className={d.dueOn < data.asOf ? "overdue" : ""}>
                      {date(d.dueOn)}
                      {d.dueOn < data.asOf && " (en retard)"}
                    </td>
                    <td className="wrap">{d.label}</td>
                    <td className="num">{eur(d.amountDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RatesPanel rates={data.projected.rates} />
    </div>
  );
}

export function Cockpit({ year }: { year: number }) {
  const { data, error } = useApi<CockpitData>(`/cockpit?year=${String(year)}`);
  return (
    <>
      <ErrorText error={error} />
      {data === null ? <p className="muted">Chargement…</p> : <CockpitView data={data} />}
    </>
  );
}
