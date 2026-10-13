import { useState } from "react";
import { eur, MONTHS } from "../lib/format.js";

export interface MonthPoint {
  month: number;
  /** null for months not realised yet. */
  realise: number | null;
  plan: number;
}

const W = 640;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 24, left: 68 };
const SHORT = [
  "janv",
  "févr",
  "mars",
  "avr",
  "mai",
  "juin",
  "juil",
  "août",
  "sept",
  "oct",
  "nov",
  "déc",
];
const SERIES = [
  { key: "realise", label: "Réalisé", color: "var(--c-realise)" },
  { key: "plan", label: "Prévisionnel", color: "var(--c-plan)" },
] as const;

/** Bar with a 4 px rounded top, anchored on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${String(x)},${String(y + h)}V${String(y + r)}Q${String(x)},${String(y)} ${String(x + r)},${String(y)}H${String(x + w - r)}Q${String(x + w)},${String(y)} ${String(x + w)},${String(y + r)}V${String(y + h)}Z`;
}

function niceMax(v: number) {
  if (v <= 0) return 100_000;
  const pow = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / pow / 2) * 2 * pow;
}

export function MonthlyChart({ data, title }: { data: MonthPoint[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = niceMax(Math.max(...data.flatMap((d) => [d.realise ?? 0, d.plan])));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const col = innerW / data.length;
  const barW = Math.max(4, (col - 10) / 2);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const hovered = hover === null ? null : data[hover];

  return (
    <section className="card">
      <div className="chart-head">
        <h3>{title}</h3>
        <button
          type="button"
          className="secondary small"
          onClick={() => {
            setTable(!table);
          }}
        >
          {table ? "Graphique" : "Tableau"}
        </button>
      </div>
      <ul className="chart-legend">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      {table ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mois</th>
                <th>Réalisé</th>
                <th>Prévisionnel</th>
                <th>Écart</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month}>
                  <td>{MONTHS[d.month - 1]}</td>
                  <td className="num">{d.realise === null ? "–" : eur(d.realise)}</td>
                  <td className="num">{eur(d.plan)}</td>
                  <td className="num">{d.realise === null ? "–" : eur(d.realise - d.plan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap">
          <svg viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label={title}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid-line" />
                <text x={PAD.left - 6} y={y(t) + 4} className="axis-label" textAnchor="end">
                  {eur(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = PAD.left + i * col + (col - (barW * 2 + 2)) / 2;
              return (
                <g key={d.month}>
                  {d.realise !== null && (
                    <path
                      d={barPath(x0, y(d.realise), barW, PAD.top + innerH - y(d.realise))}
                      fill="var(--c-realise)"
                    />
                  )}
                  <path
                    d={barPath(x0 + barW + 2, y(d.plan), barW, PAD.top + innerH - y(d.plan))}
                    fill="var(--c-plan)"
                    opacity={d.realise === null ? 1 : 0.85}
                  />
                  <text
                    x={PAD.left + i * col + col / 2}
                    y={H - 6}
                    className="axis-label"
                    textAnchor="middle"
                  >
                    {SHORT[d.month - 1]}
                  </text>
                  {/* Hit target: the whole column. */}
                  <rect
                    x={PAD.left + i * col}
                    y={PAD.top}
                    width={col}
                    height={innerH}
                    fill={hover === i ? "var(--hover)" : "transparent"}
                    onMouseEnter={() => {
                      setHover(i);
                    }}
                    onMouseLeave={() => {
                      setHover(null);
                    }}
                  />
                </g>
              );
            })}
          </svg>
          {hovered !== null && hover !== null && hovered !== undefined && (
            <div
              className="tooltip"
              style={{ left: `${String(((PAD.left + (hover + 0.5) * col) / W) * 100)}%` }}
            >
              <strong>{MONTHS[hovered.month - 1]}</strong>
              <span>Réalisé : {hovered.realise === null ? "à venir" : eur(hovered.realise)}</span>
              <span>Prévisionnel : {eur(hovered.plan)}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
