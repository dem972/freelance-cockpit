import type { Breakdown } from "@fc/engine";
import { eur, pct } from "../lib/format.js";

export const SEGMENTS = [
  { key: "net", label: "Pour toi", color: "var(--c-net)" },
  { key: "cotisations", label: "Cotisations", color: "var(--c-cotis)" },
  { key: "impot", label: "Impôt", color: "var(--c-impot)" },
  { key: "fraisPro", label: "Frais pro", color: "var(--c-frais)" },
  { key: "cfp", label: "CFP", color: "var(--c-cfp)" },
] as const;

export function BreakdownBar({ b }: { b: Breakdown }) {
  const total = Math.max(b.ca, 1);
  const parts = SEGMENTS.map((s) => ({ ...s, value: Math.max(0, b[s.key]) }));
  return (
    <div className="breakdown">
      <div
        className="bar"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${eur(p.value)}`).join(", ")}
      >
        {parts.map((p) =>
          p.value > 0 ? (
            <div
              key={p.key}
              className="bar-seg"
              style={{ width: `${String((p.value / total) * 100)}%`, background: p.color }}
              title={`${p.label} : ${eur(p.value)}`}
            />
          ) : null,
        )}
      </div>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className="swatch" style={{ background: p.color }} />
            <span className="legend-label">{p.label}</span>
            <span className="num">{eur(p.value)}</span>
            <span className="muted num">{pct(p.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
