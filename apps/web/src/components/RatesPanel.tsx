import type { UsedRate } from "@fc/shared";
import { date, eur, pct } from "../lib/format.js";

function formatValue(r: UsedRate) {
  if (r.unit === "rate") return pct(r.value as number);
  if (r.unit === "eur") return eur((r.value as number) * 100);
  return date(r.value as string);
}

export function RatesPanel({ rates }: { rates: UsedRate[] }) {
  return (
    <section className="card">
      <h3>Taux et seuils utilisés</h3>
      <p className="muted small">
        Chaque valeur vient d'une source officielle, vérifiée à la date indiquée.
      </p>
      <ul className="rates">
        {rates.map((r) => (
          <li key={r.key}>
            <div className="rate-head">
              <span className="num rate-value">{formatValue(r)}</span>
              <code className="rate-key">{r.key}</code>
              {r.flag !== undefined && (
                <span className={`badge badge-${r.flag}`}>
                  {r.flag === "conflict" ? "sources divergentes" : "non vérifié"}
                </span>
              )}
            </div>
            {r.note !== undefined && <p className="small">{r.note}</p>}
            <p className="small muted">
              <a href={r.source_url} target="_blank" rel="noreferrer">
                {new URL(r.source_url).hostname}
              </a>{" "}
              · vérifié le {date(r.verified_on)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
