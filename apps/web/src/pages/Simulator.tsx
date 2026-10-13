import { Calculator, Lightbulb, SlidersHorizontal } from "lucide-react";
import { monthsFromTjm, type YearInput } from "@fc/engine";
import {
  DEFAULT_SETTINGS,
  STATUT_LABELS,
  type Cents,
  type Settings,
  type Statut,
} from "@fc/shared";
import { AcreCard } from "@/components/AcreCard";
import { BreakdownBar } from "@/components/BreakdownBar";
import { ErrorText } from "@/components/ErrorText";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { PageHeader } from "@/components/page-header";
import { RatesPanel } from "@/components/RatesPanel";
import { SettingsForm } from "@/components/SettingsForm";
import { StatutCompare } from "@/components/StatutCompare";
import { Warnings } from "@/components/Warnings";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
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
import { useStoredState } from "@/lib/storage";
import { useCompare } from "@/lib/useCompare";
import { cn } from "@/lib/utils";

const YEAR = 2026;

interface SimState {
  tjm: number;
  jours: number;
  frais: number;
  statut: Statut;
  settings: Settings;
}

const INITIAL: SimState = {
  tjm: 500,
  jours: 18,
  frais: 150,
  statut: "micro_bnc",
  settings: DEFAULT_SETTINGS,
};

export function Simulator() {
  const [stored, setState] = useStoredState<SimState>("fc.simulator", INITIAL);
  // Older saved states may miss newer settings: fill them from the defaults.
  const state = { ...stored, settings: { ...DEFAULT_SETTINGS, ...stored.settings } };
  const { tjm, jours, frais, settings, statut } = state;

  const input: YearInput = {
    year: YEAR,
    months: monthsFromTjm({
      tjm: Math.round(tjm * 100) as Cents,
      joursParMois: jours,
      fraisProMensuels: Math.round(frais * 100) as Cents,
    }),
    timeline: [{ validFrom: `${String(YEAR)}-01-01`, settings }],
  };
  const { result: all, error, pending } = useCompare(input);
  const result = all?.find((b) => b.statut === statut) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon={Calculator}
        title={`Simulateur ${String(YEAR)}`}
        description="Ce qui te reste selon le statut, avec chaque taux sourcé"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <SlidersHorizontal className="size-5 text-primary" /> Ton activité
            </CardTitle>
            <CardDescription>Montants hors taxes.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="TJM HT">
                <MoneyInput
                  value={Math.round(tjm * 100)}
                  onChange={(v) => {
                    setState({ ...state, tjm: v / 100 });
                  }}
                />
              </Field>
              <Field label="Frais pro HT par mois">
                <MoneyInput
                  value={Math.round(frais * 100)}
                  onChange={(v) => {
                    setState({ ...state, frais: v / 100 });
                  }}
                />
              </Field>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <Label>Jours facturés par mois</Label>
                <span className="num font-serif text-lg font-semibold text-primary">{jours} j</span>
              </div>
              <Slider
                min={0}
                max={23}
                step={0.5}
                value={[jours]}
                onValueChange={([v]) => {
                  setState({ ...state, jours: v ?? 0 });
                }}
                aria-label="Jours facturés par mois"
              />
              <p className="text-xs text-muted-foreground">
                soit <span className="num">{eur(tjm * jours * 12 * 100)}</span> de CA sur l'année
              </p>
            </div>
            <details className="group rounded-xl border bg-background/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold marker:text-primary">
                Options avancées
              </summary>
              <div className="pt-5">
                <SettingsForm
                  value={settings}
                  onChange={(s) => {
                    setState({ ...state, settings: s });
                  }}
                />
              </div>
            </details>
          </CardContent>
        </Card>

        <Card
          aria-busy={pending}
          className={cn(
            "border-primary/25 bg-gradient-to-br from-accent/60 via-card to-card transition-opacity",
            pending && result !== null && "opacity-70",
          )}
        >
          <CardContent className="grid gap-5">
            <ErrorText error={error} />
            {result === null ? (
              <div className="grid gap-4">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-14 w-1/2" />
                <Skeleton className="h-40" />
              </div>
            ) : (
              <>
                <div>
                  <Badge variant="secondary">{STATUT_LABELS[statut]}</Badge>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Ce qui reste pour toi sur l'année
                  </p>
                  <p className="num font-serif text-5xl font-semibold tracking-tight">
                    {eur(result.net)}
                  </p>
                  <p className="num mt-1 text-sm text-muted-foreground">
                    soit <strong className="text-foreground">{eur(result.net / 12)}</strong> par
                    mois · CA {eur(result.ca)}
                  </p>
                  {result.netRange !== undefined && (
                    <p className="num mt-1 text-sm">
                      Fourchette : {eur(result.netRange.min)} – {eur(result.netRange.max)}
                    </p>
                  )}
                </div>
                <BreakdownBar b={result} />
                <Warnings warnings={result.warnings} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {all !== null && (
        <StatutCompare
          results={all}
          selected={statut}
          onSelect={(s) => {
            setState({ ...state, statut: s });
          }}
        />
      )}

      {result?.acre !== undefined && (
        <AcreCard acre={result.acre} asOf={new Date().toISOString().slice(0, 10)} />
      )}

      {result !== null && (
        <Tabs defaultValue="mois" className="min-w-0">
          <TabsList>
            <TabsTrigger value="mois">Détail mensuel</TabsTrigger>
            <TabsTrigger value="taux">Taux sourcés</TabsTrigger>
            <TabsTrigger value="hypotheses">Hypothèses</TabsTrigger>
          </TabsList>
          <TabsContent value="mois" className="min-w-0">
            <Card>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mois</TableHead>
                      <TableHead className="text-right">CA</TableHead>
                      <TableHead className="text-right">Cotisations</TableHead>
                      <TableHead className="text-right">CFP</TableHead>
                      <TableHead className="text-right">Impôt</TableHead>
                      <TableHead className="text-right">TVA due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.months.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell>
                          {MONTHS[m.month - 1]}
                          {m.acre && (
                            <Badge
                              variant="outline"
                              className="ml-2 border-success/40 text-success"
                            >
                              Acre
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="num text-right">{eur(m.ca)}</TableCell>
                        <TableCell className="num text-right">{eur(m.cotisations)}</TableCell>
                        <TableCell className="num text-right">{eur(m.cfp)}</TableCell>
                        <TableCell className="num text-right">{eur(m.impot)}</TableCell>
                        <TableCell className="num text-right">
                          {eur(m.tvaCollectee - m.tvaDeductible)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="taux" className="min-w-0">
            <RatesPanel rates={result.rates} />
          </TabsContent>
          <TabsContent value="hypotheses" className="min-w-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif text-lg">
                  <Lightbulb className="size-5 text-primary" /> Hypothèses de calcul
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 pl-5 text-sm [list-style:disc]">
                  {result.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
