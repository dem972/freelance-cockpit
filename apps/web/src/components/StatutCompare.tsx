import type { Breakdown } from "@fc/engine";
import { STATUT_LABELS, type Statut } from "@fc/shared";
import { eur } from "../lib/format.js";
import { SEGMENTS } from "./BreakdownBar.js";

interface Props {
  results: Breakdown[];
  selected: Statut;
  onSelect: (s: Statut) => void;
}

export function StatutCompare({ results, selected, onSelect }: Props) {
  const best = Math.max(...results.map((r) => r.net));
  const scale = Math.max(...results.map((r) => r.ca), 1);
  return (
    <section className="card">
      <h3>Comparaison des statuts</h3>
      <div className="compare">
        {results.map((r) => (
          <button
            key={r.statut}
            type="button"
            className={`compare-row${r.statut === selected ? " selected" : ""}`}
            aria-pressed={r.statut === selected}
            onClick={() => {
              onSelect(r.statut);
            }}
          >
            <span className="compare-label">
              {STATUT_LABELS[r.statut]}
              {r.net === best && <span className="badge">le plus favorable</span>}
            </span>
            <span className="compare-net num">
              {eur(r.net)}
              {r.netRange !== undefined && (
                <span className="muted small">
                  {" "}
                  ({eur(r.netRange.min)} – {eur(r.netRange.max)})
                </span>
              )}
            </span>
            <span className="mini-bar" aria-hidden="true">
              {SEGMENTS.map((s) => {
                const v = Math.max(0, r[s.key]);
                return v > 0 ? (
                  <span
                    key={s.key}
                    style={{ width: `${String((v / scale) * 100)}%`, background: s.color }}
                  />
                ) : null;
              })}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
