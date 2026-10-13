import { useEffect, useState } from "react";
import {
  FileBarChart,
  FileText,
  Lightbulb,
  Loader2,
  Play,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import type { OptimizationResult } from "@fc/engine/cockpit";
import { ErrorText } from "@/components/ErrorText";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { eur, date } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ReportSummary {
  id: number;
  period: string;
  title: string;
  created_at: string;
}
interface Report extends ReportSummary {
  markdown: string;
}

async function agentGet<T>(url: string): Promise<T> {
  const res = await fetch(`/agent${url}`);
  if (!res.ok) throw new Error(`Erreur ${String(res.status)}`);
  return (await res.json()) as T;
}

/** Net as a function of the share paid as salary, for EURL IS and SASU. */
function RemunerationCurve({ curves }: { curves: OptimizationResult["remunerationCurves"] }) {
  const series = [
    { key: "eurl_is" as const, label: "EURL à l'IS", color: "var(--chart-realise)" },
    { key: "sasu" as const, label: "SASU", color: "var(--chart-plan)" },
  ];
  const W = 520;
  const H = 180;
  const P = { l: 64, r: 12, t: 10, b: 26 };
  const all = series.flatMap((s) => curves[s.key].map((p) => p.net));
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(max - min, 1);
  const x = (part: number) => P.l + part * (W - P.l - P.r);
  const y = (net: number) => P.t + (1 - (net - min) / span) * (H - P.t - P.b);
  return (
    <div className="grid gap-2">
      <ul className="flex gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        className="h-auto w-full"
        role="img"
        aria-label="Net selon la part en rémunération"
      >
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="stroke-border" />
            <text
              x={P.l - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {eur(v)}
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((p) => (
          <text
            key={p}
            x={x(p)}
            y={H - 6}
            textAnchor={p === 0 ? "start" : p === 1 ? "end" : "middle"}
            className="fill-muted-foreground text-[11px]"
          >
            {Math.round(p * 100)} % salaire
          </text>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              points={curves[s.key]
                .map((p) => `${String(x(p.part))},${String(y(p.net))}`)
                .join(" ")}
            />
            {curves[s.key].map((p) => (
              <circle
                key={p.part}
                cx={x(p.part)}
                cy={y(p.net)}
                r={4}
                fill={s.color}
                className="stroke-card"
                strokeWidth={2}
              >
                <title>
                  {s.label}, {Math.round(p.part * 100)} % en rémunération : {eur(p.net)}
                </title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

function Optimizations({ year }: { year: number }) {
  const { data, error } = useApi<OptimizationResult>(`/optimize?year=${String(year)}`);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Lightbulb className="size-5 text-primary" /> Pistes chiffrées
        </CardTitle>
        <CardDescription>
          Ton année réelle (réalisé + prévisionnel) rejouée par le moteur, un levier à la fois.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <ErrorText error={error} />
        {data === null ? (
          error === null && <Skeleton className="h-48" />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-secondary p-4">
              <span className="text-sm">{data.baseline.title}</span>
              <span className="num font-serif text-2xl font-semibold">
                {eur(data.baseline.net)}
              </span>
            </div>
            <ul className="grid gap-2">
              {data.options.map((o) => {
                const up = o.gain > 0;
                return (
                  <li key={o.id} className="grid gap-1 rounded-xl border bg-background/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{o.title}</span>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "num",
                            up
                              ? "border-success/40 text-success"
                              : "border-destructive/30 text-destructive",
                          )}
                        >
                          {up ? <TrendingUp /> : <TrendingDown />}
                          {up ? "+" : ""}
                          {eur(o.gain)}
                        </Badge>
                        <span className="num font-serif text-base font-semibold">{eur(o.net)}</span>
                      </div>
                    </div>
                    {o.netRange !== undefined && (
                      <p className="num text-xs text-muted-foreground">
                        fourchette {eur(o.netRange.min)} – {eur(o.netRange.max)}
                      </p>
                    )}
                    {o.warnings.length > 0 && (
                      <p className="text-xs text-muted-foreground">{o.warnings.join(" · ")}</p>
                    )}
                  </li>
                );
              })}
            </ul>
            <RemunerationCurve curves={data.remunerationCurves} />
            <p className="text-xs text-muted-foreground italic">{data.disclaimer}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Reports() {
  const [list, setList] = useState<ReportSummary[] | null>(null);
  const [selected, setSelected] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  const load = () => {
    agentGet<ReportSummary[]>("/reports")
      .then((r) => {
        setList(r);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  };
  useEffect(load, []);

  const open = (id: number) => {
    agentGet<Report>(`/reports/${String(id)}`)
      .then(setSelected)
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : String(e));
      });
  };

  const generate = () => {
    const before = list?.[0]?.id ?? 0;
    setWaiting(true);
    fetch("/agent/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${String(res.status)}`);
        toast.info("Rapport en cours de génération…");
        // The worker writes it in a few seconds: poll for up to a minute.
        let tries = 0;
        const timer = window.setInterval(() => {
          tries += 1;
          agentGet<ReportSummary[]>("/reports")
            .then((r) => {
              if ((r[0]?.id ?? 0) > before || tries >= 30) {
                window.clearInterval(timer);
                setWaiting(false);
                setList(r);
                if ((r[0]?.id ?? 0) > before && r[0] !== undefined) {
                  open(r[0].id);
                  toast.success("Rapport prêt");
                } else {
                  toast.error("Le rapport n'est pas arrivé : vérifie les logs du worker.");
                }
              }
            })
            .catch(() => undefined);
        }, 2000);
      })
      .catch((e: unknown) => {
        setWaiting(false);
        toast.error(e instanceof Error ? e.message : String(e));
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <FileText className="size-5 text-primary" /> Rapports mensuels
        </CardTitle>
        <CardDescription>
          Générés le 1er de chaque mois pour le mois écoulé, ou à la demande. Sans clé OpenAI, le
          rapport est un gabarit chiffré ; avec une clé, l'IA le rédige à partir des mêmes chiffres.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={generate} disabled={waiting}>
            {waiting ? <Loader2 className="animate-spin" /> : <Play />} Générer
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ErrorText error={error} />
        <ul className="grid content-start gap-2">
          {list?.length === 0 && (
            <li className="text-sm text-muted-foreground">Aucun rapport pour l'instant.</li>
          )}
          {list?.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  open(r.id);
                }}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors hover:bg-accent/50",
                  selected?.id === r.id && "border-primary bg-accent/60",
                )}
              >
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  généré le {date(r.created_at.slice(0, 10))}
                </p>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 rounded-xl border bg-background/60 p-5 text-sm leading-relaxed">
          {selected === null ? (
            <p className="text-muted-foreground">Choisis un rapport à lire.</p>
          ) : (
            <Markdown text={selected.markdown} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function Rapports({ year }: { year: number }) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon={FileBarChart}
        title="Rapports"
        description="Synthèses mensuelles et pistes chiffrées par le moteur"
      />
      <Reports />
      <Optimizations year={year} />
    </div>
  );
}
