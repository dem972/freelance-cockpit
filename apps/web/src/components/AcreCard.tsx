import type { AcreSummary } from "@fc/engine";
import { date, eur } from "../lib/format.js";

const monthName = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Acre: when it runs out and what it saves. `asOf` drives the progress bar. */
export function AcreCard({ acre, asOf }: { acre: AcreSummary; asOf: string }) {
  const start = Date.parse(`${acre.debutActivite}T00:00:00Z`);
  const end = Date.parse(`${acre.fin}T00:00:00Z`);
  const now = Date.parse(`${asOf}T00:00:00Z`);
  const elapsed = Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
  const over = now > end;
  return (
    <section className="card">
      <h3>Acre</h3>
      <p>
        {over ? "Terminée depuis le " : "Taux réduit jusqu'au "}
        <strong>{date(acre.fin)}</strong> · mois d'épuisement :{" "}
        <strong>{monthName.format(new Date(`${acre.moisEpuisement}-01T00:00:00Z`))}</strong>
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(elapsed * 100)}
        aria-label="Période Acre écoulée"
      >
        <span style={{ width: `${String(elapsed * 100)}%` }} />
      </div>
      <p className="small muted">
        Début d'activité le {date(acre.debutActivite)} · {Math.round(elapsed * 100)} % de la période
        écoulée
      </p>
      <p>
        Économie de cotisations sur l'année : <strong className="num">{eur(acre.economie)}</strong>
      </p>
      <p className="small muted">{acre.regle}</p>
    </section>
  );
}
