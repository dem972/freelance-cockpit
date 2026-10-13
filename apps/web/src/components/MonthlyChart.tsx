import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { eur, MONTHS } from "@/lib/format";

export interface MonthPoint {
  month: number;
  /** null for months not realised yet. */
  realise: number | null;
  plan: number;
}

const W = 640;
const H = 230;
const PAD = { top: 12, right: 8, bottom: 26, left: 68 };
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
  { key: "realise", label: "Réalisé", color: "var(--chart-realise)" },
  { key: "plan", label: "Prévisionnel", color: "var(--chart-plan)" },
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

function Chart({ data, title }: { data: MonthPoint[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.flatMap((d) => [d.realise ?? 0, d.plan])));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const col = innerW / data.length;
  const barW = Math.max(4, (col - 10) / 2);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const hovered = hover === null ? undefined : data[hover];
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        role="img"
        aria-label={title}
        className="block h-auto w-full"
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(f * max)}
              y2={y(f * max)}
              className="stroke-border"
            />
            <text
              x={PAD.left - 8}
              y={y(f * max) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {eur(f * max)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = PAD.left + i * col + (col - (barW * 2 + 2)) / 2;
          return (
            <g key={d.month}>
              <rect
                x={PAD.left + i * col}
                y={PAD.top}
                width={col}
                height={innerH}
                rx={6}
                className={hover === i ? "fill-muted" : "fill-transparent"}
              />
              {d.realise !== null && (
                <path
                  d={barPath(x0, y(d.realise), barW, PAD.top + innerH - y(d.realise))}
                  fill="var(--chart-realise)"
                />
              )}
              <path
                d={barPath(x0 + barW + 2, y(d.plan), barW, PAD.top + innerH - y(d.plan))}
                fill="var(--chart-plan)"
              />
              <text
                x={PAD.left + i * col + col / 2}
                y={H - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {SHORT[d.month - 1]}
              </text>
              {/* Hit target: the whole column. */}
              <rect
                x={PAD.left + i * col}
                y={PAD.top}
                width={col}
                height={innerH}
                fill="transparent"
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
      {hovered !== undefined && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 grid -translate-x-1/2 gap-0.5 rounded-lg border bg-popover px-3 py-2 text-xs whitespace-nowrap shadow-md"
          style={{ left: `${String(((PAD.left + (hover + 0.5) * col) / W) * 100)}%` }}
        >
          <strong className="text-sm">{MONTHS[hovered.month - 1]}</strong>
          <span>Réalisé : {hovered.realise === null ? "à venir" : eur(hovered.realise)}</span>
          <span>Prévisionnel : {eur(hovered.plan)}</span>
        </div>
      )}
    </div>
  );
}

export function MonthlyChart({ data, title }: { data: MonthPoint[]; title: string }) {
  return (
    <Card>
      <Tabs defaultValue="chart" className="gap-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <BarChart3 className="size-5 text-primary" /> {title}
          </CardTitle>
          <CardDescription>
            <ul className="mt-1 flex gap-4">
              {SERIES.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
                  {s.label}
                </li>
              ))}
            </ul>
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-3 flex justify-end">
            <TabsList>
              <TabsTrigger value="chart">Graphique</TabsTrigger>
              <TabsTrigger value="table">Tableau</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="chart">
            <Chart data={data} title={title} />
          </TabsContent>
          <TabsContent value="table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mois</TableHead>
                  <TableHead className="text-right">Réalisé</TableHead>
                  <TableHead className="text-right">Prévisionnel</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d) => (
                  <TableRow key={d.month}>
                    <TableCell>{MONTHS[d.month - 1]}</TableCell>
                    <TableCell className="num text-right">
                      {d.realise === null ? "–" : eur(d.realise)}
                    </TableCell>
                    <TableCell className="num text-right">{eur(d.plan)}</TableCell>
                    <TableCell className="num text-right">
                      {d.realise === null ? "–" : eur(d.realise - d.plan)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
