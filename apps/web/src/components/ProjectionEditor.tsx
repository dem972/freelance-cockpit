import { useState } from "react";
import { CalendarDays, Save } from "lucide-react";
import { toast } from "sonner";
import { isJourOuvre, joursFeries, joursPrevus } from "@fc/engine";
import type { Cents, Projection } from "@fc/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, useApi } from "@/lib/api";
import { eur, MONTHS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorText } from "./ErrorText";
import { Field } from "./Field";
import { MoneyInput } from "./MoneyInput";

const pad = (n: number) => String(n).padStart(2, "0");

function emptyProjection(year: number): Projection {
  return {
    year,
    tjm: 50000 as Cents,
    joursParMois: Array<number>(12).fill(18),
    fraisMensuels: 15000 as Cents,
    conges: [],
    joursDepuisCalendrier: true,
  };
}

/** One month; working days are clickable to toggle a day off. */
function MonthGrid({
  year,
  month,
  conges,
  feries,
  jours,
  tjm,
  onToggle,
}: {
  year: number;
  month: number;
  conges: Set<string>;
  feries: Set<string>;
  jours: number;
  tjm: number;
  onToggle: (day: string) => void;
}) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => `${String(year)}-${pad(month)}-${pad(i + 1)}`),
  ];
  return (
    <div className="rounded-xl border bg-background/60 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-serif font-semibold">{MONTHS[month - 1]}</span>
        <span className="num text-xs text-muted-foreground">
          {jours} j · {eur(tjm * jours)}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <span key={`h${String(i)}`} className="pb-1 text-muted-foreground">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${String(i)}`} />;
          const ouvre = isJourOuvre(day);
          const off = conges.has(day);
          const ferie = feries.has(day);
          const label = `${day}${ferie ? " (férié)" : ""}${off ? " (congé)" : ""}`;
          return ouvre ? (
            <button
              key={day}
              type="button"
              aria-pressed={off}
              aria-label={label}
              title={label}
              onClick={() => {
                onToggle(day);
              }}
              className={cn(
                "aspect-square rounded-md text-[11px] transition-colors",
                off
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "bg-secondary hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {Number(day.slice(8))}
            </button>
          ) : (
            <span
              key={day}
              title={label}
              className={cn(
                "flex aspect-square items-center justify-center text-muted-foreground/50",
                ferie && "text-primary/70 underline decoration-dotted",
              )}
            >
              {Number(day.slice(8))}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function ProjectionEditor({ year }: { year: number }) {
  const stored = useApi<Projection | null>(`/projections/${String(year)}`);
  const [draft, setDraft] = useState<Projection | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (stored.data === null && stored.error === null) return null;
  const p = draft ?? stored.data ?? emptyProjection(year);
  const conges = new Set(p.conges);
  const feries = new Set(joursFeries(year));
  const jours = joursPrevus(p);
  const total = jours.reduce((a, b) => a + b, 0);
  const nbConges = p.conges.filter(isJourOuvre).length;

  const save = () => {
    api
      .put(`/projections/${String(year)}`, p)
      .then(() => {
        setDraft(null);
        setError(null);
        stored.reload();
        toast.success("Prévisionnel enregistré", {
          description: "Provisions et net projeté recalculés.",
        });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <CalendarDays className="size-5 text-primary" /> Prévisionnel {year}
        </CardTitle>
        <CardDescription>
          Sert pour les mois pas encore réalisés : CA projeté, taux d'impôt à provisionner, net
          projeté.
        </CardDescription>
        <CardAction>
          <Badge variant="outline" className="num">
            CA projeté {eur(p.tjm * total)}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="TJM HT">
            <MoneyInput
              value={p.tjm}
              onChange={(v) => {
                setDraft({ ...p, tjm: v as Cents });
              }}
            />
          </Field>
          <Field label="Frais pro HT par mois">
            <MoneyInput
              value={p.fraisMensuels}
              onChange={(v) => {
                setDraft({ ...p, fraisMensuels: v as Cents });
              }}
            />
          </Field>
        </div>
        <Tabs
          value={p.joursDepuisCalendrier ? "calendrier" : "manuel"}
          onValueChange={(v) => {
            setDraft({ ...p, joursDepuisCalendrier: v === "calendrier" });
          }}
        >
          <TabsList>
            <TabsTrigger value="calendrier">Calendrier et congés</TabsTrigger>
            <TabsTrigger value="manuel">Saisie par mois</TabsTrigger>
          </TabsList>
          <TabsContent value="calendrier" className="grid gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge>{total} jours facturables</Badge>
              <Badge variant="secondary">{nbConges} jours de congé</Badge>
              <span className="text-muted-foreground">
                Clique sur un jour pour le poser en congé. Week-ends et fériés sont exclus d'office.
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }, (_, i) => (
                <MonthGrid
                  key={i}
                  year={year}
                  month={i + 1}
                  conges={conges}
                  feries={feries}
                  jours={jours[i] ?? 0}
                  tjm={p.tjm}
                  onToggle={(day) => {
                    const next = conges.has(day)
                      ? p.conges.filter((d) => d !== day)
                      : [...p.conges, day].sort();
                    setDraft({ ...p, conges: next });
                  }}
                />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="manuel" className="pt-2">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {MONTHS.map((m, i) => (
                <Field key={m} label={m}>
                  <Input
                    type="number"
                    min={0}
                    max={31}
                    step={0.5}
                    value={p.joursParMois[i]}
                    onChange={(e) => {
                      const next = [...p.joursParMois];
                      next[i] = Number(e.target.value);
                      setDraft({ ...p, joursParMois: next });
                    }}
                  />
                </Field>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        <ErrorText error={error ?? stored.error} />
      </CardContent>
      <CardFooter className="justify-end gap-2">
        {draft !== null && (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(null);
            }}
          >
            Annuler
          </Button>
        )}
        <Button disabled={draft === null} onClick={save}>
          <Save /> Enregistrer le prévisionnel
        </Button>
      </CardFooter>
    </Card>
  );
}
