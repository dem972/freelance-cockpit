import {
  CalendarClock,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { CockpitData } from "@fc/engine/cockpit";
import { AcreCard } from "@/components/AcreCard";
import { BreakdownBar } from "@/components/BreakdownBar";
import { CoverageRing } from "@/components/CoverageRing";
import { ErrorText } from "@/components/ErrorText";
import { MonthlyChart } from "@/components/MonthlyChart";
import { PageHeader } from "@/components/page-header";
import { RatesPanel } from "@/components/RatesPanel";
import { StatCard } from "@/components/stat-card";
import { Warnings } from "@/components/Warnings";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { date, eur } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<string, typeof Receipt> = {
  urssaf: Landmark,
  tva: Receipt,
  impot: PiggyBank,
};

function Echeancier({ data }: { data: CockpitData }) {
  const upcoming = data.deadlines.filter((d) => d.paidOn === null && d.amountDue > 0);
  const total = upcoming.reduce((a, d) => a + d.amountDue, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <CalendarClock className="size-5 text-primary" /> Échéancier
        </CardTitle>
        <CardDescription>
          {upcoming.length === 0
            ? "Rien à payer."
            : `${String(upcoming.length)} à venir · ${eur(total)} au total`}
        </CardDescription>
      </CardHeader>
      {upcoming.length > 0 && (
        <CardContent>
          <ol className="relative grid gap-3 border-l border-border pl-5">
            {upcoming.map((d) => {
              const late = d.dueOn < data.asOf;
              const days = Math.round((Date.parse(d.dueOn) - Date.parse(data.asOf)) / 86_400_000);
              const Icon = KIND_ICON[d.kind] ?? Receipt;
              return (
                <li key={d.id} className="relative">
                  <span
                    className={cn(
                      "absolute top-1.5 -left-[27px] flex size-3 rounded-full ring-4 ring-card",
                      late ? "bg-destructive" : "bg-primary",
                    )}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/60 p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">{d.label}</p>
                        <p className="text-xs text-muted-foreground">avant le {date(d.dueOn)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={late ? "destructive" : "secondary"}>
                        {late ? `en retard de ${String(-days)} j` : `dans ${String(days)} j`}
                      </Badge>
                      <span className="num font-serif text-base font-semibold">
                        {eur(d.amountDue)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      )}
    </Card>
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
  const ecart = data.realised.ca - planToDate;
  const monthly = data.realised.months.map((m, i) => ({
    month: m.month,
    realise: m.month <= lastMonth ? m.ca : null,
    plan: data.plan.months[i]?.ca ?? 0,
  }));

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          highlight
          icon={Wallet}
          label="Solde disponible"
          value={eur(data.balance.available)}
          sub="solde − provisions non payées"
        />
        <StatCard
          icon={Landmark}
          label="Solde bancaire"
          value={eur(data.balance.balance)}
          sub={
            data.balance.snapshotDate === null
              ? "aucun relevé : somme des mouvements"
              : `relevé du ${date(data.balance.snapshotDate)} + mouvements`
          }
        />
        <StatCard
          icon={TrendingUp}
          label={`CA réalisé ${String(data.year)}`}
          value={eur(data.realised.ca)}
          trend={{ label: `${ecart >= 0 ? "+" : ""}${eur(ecart)}`, positive: ecart >= 0 }}
          sub={`vs ${eur(planToDate)} prévus`}
        />
        <StatCard
          icon={PiggyBank}
          label="Net projeté fin d'année"
          value={eur(data.projected.net)}
          sub={`réalisé ${eur(data.realised.net)} · plan ${eur(data.plan.net)}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CoverageRing
          coverage={data.coverage}
          unpaid={data.balance.provisionsUnpaid}
          asOf={data.asOf}
        />
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Projection fin d'année</CardTitle>
            <CardDescription>
              Réalisé jusqu'au {date(data.asOf)}, prévisionnel ensuite.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <BreakdownBar b={data.projected} />
            <Warnings warnings={data.projected.warnings} />
          </CardContent>
        </Card>
      </div>

      {data.projected.acre !== undefined && (
        <AcreCard acre={data.projected.acre} asOf={data.asOf} />
      )}

      <MonthlyChart data={monthly} title="CA HT par mois" />
      <Echeancier data={data} />
      <RatesPanel rates={data.projected.rates} />
    </div>
  );
}

function CockpitSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

export function Cockpit({ year }: { year: number }) {
  const { data, error } = useApi<CockpitData>(`/cockpit?year=${String(year)}`);
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Cockpit"
        description={`Ta trésorerie freelance ${String(year)} en un coup d'œil`}
      />
      <ErrorText error={error} />
      {data === null ? error === null && <CockpitSkeleton /> : <CockpitView data={data} />}
    </div>
  );
}
