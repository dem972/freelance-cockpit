import type { CockpitCoverage } from "@fc/engine/cockpit";
import { date, eur, pct } from "../lib/format.js";

/** Share of the unpaid provisions that the bank balance covers. */
export function CoverageRing({ coverage, unpaid }: { coverage: CockpitCoverage; unpaid: number }) {
  const ratio = coverage.ratio;
  const shown = ratio === null ? 1 : Math.max(0, Math.min(1, ratio));
  const ok = ratio === null || ratio >= 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <section className="card coverage">
      <h3>Couverture des provisions</h3>
      <div className="coverage-body">
        <svg
          viewBox="0 0 128 128"
          width="128"
          height="128"
          role="img"
          aria-label={`Couverture ${ratio === null ? "complète" : pct(ratio)}`}
        >
          <circle cx="64" cy="64" r={r} className="ring-track" />
          <circle
            cx="64"
            cy="64"
            r={r}
            className="ring-value"
            stroke={ok ? "var(--good)" : "var(--danger)"}
            strokeDasharray={`${String(c * shown)} ${String(c)}`}
            transform="rotate(-90 64 64)"
          />
          <text x="64" y="70" textAnchor="middle" className="ring-label">
            {ratio === null ? "—" : pct(Math.min(ratio, 9.99))}
          </text>
        </svg>
        <div>
          <p className={ok ? "status-good" : "status-bad"}>
            {ok ? "✓ Provisions couvertes" : "⚠ Solde insuffisant pour les provisions"}
          </p>
          <p className="small muted">Provisions non payées : {eur(unpaid)}</p>
          {coverage.next === null ? (
            <p className="small">Aucune échéance à venir.</p>
          ) : (
            <p className="small">
              Prochaine échéance : <strong>{coverage.next.label}</strong>,{" "}
              {eur(coverage.next.amount)} le {date(coverage.next.dueOn)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
