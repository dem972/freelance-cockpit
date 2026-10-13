import { CalendarClock, CircleCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import type { CockpitCoverage } from "@fc/engine/cockpit";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { date, eur, pct } from "@/lib/format";

/** Share of the unpaid provisions that the bank balance covers. */
export function CoverageRing({
  coverage,
  unpaid,
  asOf,
}: {
  coverage: CockpitCoverage;
  unpaid: number;
  asOf: string;
}) {
  const ratio = coverage.ratio;
  const shown = ratio === null ? 1 : Math.max(0, Math.min(1, ratio));
  const ok = ratio === null || ratio >= 1;
  const r = 54;
  const c = 2 * Math.PI * r;
  // Above 150 %, a multiplier reads better than a long percentage.
  const label =
    ratio === null
      ? "—"
      : ratio >= 1.5
        ? `×${ratio >= 10 ? "10+" : ratio.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`
        : pct(ratio);
  const days =
    coverage.next === null
      ? null
      : Math.round((Date.parse(coverage.next.dueOn) - Date.parse(asOf)) / 86_400_000);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          {ok ? (
            <ShieldCheck className="size-5 text-success" />
          ) : (
            <ShieldAlert className="size-5 text-destructive" />
          )}
          Couverture des provisions
        </CardTitle>
        <CardDescription>Ton solde couvre-t-il ce que tu dois mettre de côté ?</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-center gap-6">
          <svg
            viewBox="0 0 136 136"
            className="size-32 shrink-0"
            role="img"
            aria-label={`Couverture ${ratio === null ? "complète" : pct(ratio)}`}
          >
            <circle cx="68" cy="68" r={r} fill="none" strokeWidth="12" className="stroke-muted" />
            <circle
              cx="68"
              cy="68"
              r={r}
              fill="none"
              strokeWidth="12"
              strokeLinecap="round"
              stroke={ok ? "var(--success)" : "var(--destructive)"}
              strokeDasharray={`${String(c * shown)} ${String(c)}`}
              transform="rotate(-90 68 68)"
              className="transition-[stroke-dasharray] duration-700"
            />
            <text
              x="68"
              y="66"
              textAnchor="middle"
              className="num fill-foreground font-serif text-[22px] font-semibold"
            >
              {label}
            </text>
            <text x="68" y="86" textAnchor="middle" className="fill-muted-foreground text-[11px]">
              couvert
            </text>
          </svg>
          <div className="grid flex-1 gap-3 text-sm">
            <Badge
              variant="outline"
              className={
                ok ? "border-success/40 text-success" : "border-destructive/40 text-destructive"
              }
            >
              {ok ? <CircleCheck /> : <ShieldAlert />}
              {ok ? "Provisions couvertes" : "Solde insuffisant"}
            </Badge>
            <div>
              <p className="text-muted-foreground">Provisions non payées</p>
              <p className="num font-serif text-xl font-semibold">{eur(unpaid)}</p>
            </div>
          </div>
        </div>
        {coverage.next === null ? (
          <p className="text-muted-foreground">Aucune échéance à venir.</p>
        ) : (
          <div className="flex items-start gap-2 rounded-lg bg-secondary p-3">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium">{coverage.next.label}</p>
              <p className="num text-muted-foreground">
                {eur(coverage.next.amount)} le {date(coverage.next.dueOn)}
                {days !== null &&
                  (days >= 0 ? ` · dans ${String(days)} j` : ` · en retard de ${String(-days)} j`)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
