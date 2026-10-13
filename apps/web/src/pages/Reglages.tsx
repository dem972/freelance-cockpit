import { useState } from "react";
import { History, Landmark, Save, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { settingsAt } from "@fc/engine";
import {
  STATUT_LABELS,
  type BalanceSnapshot,
  type Settings,
  type SettingsPatch,
  type SettingsTimeline,
  type Statut,
} from "@fc/shared";
import { ErrorText } from "@/components/ErrorText";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { PageHeader } from "@/components/page-header";
import { ProjectionEditor } from "@/components/ProjectionEditor";
import { Choice, SettingsForm } from "@/components/SettingsForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { api, useApi } from "@/lib/api";
import { date, eur } from "@/lib/format";

const FIELD_LABELS: Record<keyof Settings, string> = {
  statut: "Statut",
  caisse: "Caisse",
  versementLiberatoire: "Versement libératoire",
  acreDebutActivite: "Acre",
  tva: "TVA",
  periodiciteUrssaf: "Périodicité Urssaf",
  situationFamiliale: "Situation familiale",
  parts: "Parts",
  autresRevenusImposables: "Autres revenus",
  partRemuneration: "Part en rémunération",
  capitalEtComptesCourants: "Capital + comptes courants",
  fraisGestionPortage: "Frais de portage",
};

function changes(patch: SettingsPatch["settings"]): string[] {
  return Object.entries(patch).map(([k, v]) => {
    const label = FIELD_LABELS[k as keyof Settings];
    if (k === "statut") return `${label} : ${STATUT_LABELS[v as Statut]}`;
    if (typeof v === "boolean") return `${label} : ${v ? "oui" : "non"}`;
    if (k === "autresRevenusImposables" || k === "capitalEtComptesCourants") {
      return `${label} : ${eur(v as number)}`;
    }
    return `${label} : ${String(v ?? "aucune")}`;
  });
}

/** Only the settings that differ from those already in effect. */
function diff(before: Settings, after: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof Settings)[]) {
    if (after[key] !== before[key]) out[key] = after[key];
  }
  return out;
}

function TimelineEditor({
  timeline,
  onSaved,
}: {
  timeline: SettingsTimeline;
  onSaved: () => void;
}) {
  const sorted = [...timeline].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const effective = settingsAt(sorted, validFrom);
  const [draft, setDraft] = useState<Settings | null>(null);
  const current = draft ?? effective;
  const [error, setError] = useState<string | null>(null);

  const save = (next: SettingsTimeline, message: string) => {
    setError(null);
    api
      .put("/settings", next)
      .then(() => {
        setDraft(null);
        toast.success(message, { description: "Provisions et échéances recalculées." });
        onSaved();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  };

  const addChange = () => {
    const first = sorted[0];
    if (first !== undefined && validFrom <= first.validFrom) {
      // On or before the first date: becomes the new complete starting point.
      save(
        [{ validFrom, settings: current }, ...sorted.filter((p) => p.validFrom !== validFrom)],
        "Réglages de départ mis à jour",
      );
      return;
    }
    const delta = diff(effective, current);
    if (Object.keys(delta).length === 0) {
      setError("Aucun changement par rapport aux réglages en vigueur à cette date.");
      return;
    }
    const existing = sorted.find((p) => p.validFrom === validFrom);
    const patch = { validFrom, settings: { ...(existing?.settings ?? {}), ...delta } };
    save(
      [...sorted.filter((p) => p.validFrom !== validFrom), patch],
      `Changement enregistré au ${date(validFrom)}`,
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <History className="size-5 text-primary" /> Historique
          </CardTitle>
          <CardDescription>
            Chaque changement s'applique à partir de sa date : fin d'Acre, passage à la TVA, option
            VFL, changement de statut, mariage…
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="relative grid gap-4 border-l border-border pl-5">
            {sorted.map((p, i) => (
              <li key={p.validFrom} className="relative">
                <span className="absolute top-1 -left-[27px] size-3 rounded-full bg-primary ring-4 ring-card" />
                <div className="flex items-start justify-between gap-2">
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-semibold">{date(p.validFrom)}</span>
                      {i === 0 && <Badge variant="secondary">départ</Badge>}
                    </div>
                    {i === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {STATUT_LABELS[p.settings.statut ?? "micro_bnc"]} · réglages complets
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {changes(p.settings).map((c) => (
                          <Badge key={c} variant="outline" className="font-normal">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {i > 0 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Retirer le changement du ${date(p.validFrom)}`}
                      onClick={() => {
                        save(
                          sorted.filter((x) => x.validFrom !== p.validFrom),
                          "Changement retiré",
                        );
                      }}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Ajouter ou modifier à une date</CardTitle>
          <CardDescription>
            Le formulaire part des réglages en vigueur à la date choisie.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            <Field label="À partir du">
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => {
                  setValidFrom(e.target.value);
                  setDraft(null);
                }}
              />
            </Field>
            <Field label="Statut">
              <Choice
                value={current.statut}
                options={(Object.keys(STATUT_LABELS) as Statut[]).map(
                  (s) => [s, STATUT_LABELS[s]] as const,
                )}
                onChange={(statut) => {
                  setDraft({ ...current, statut });
                }}
              />
            </Field>
            <Field label="Périodicité Urssaf (micro)">
              <Choice
                value={current.periodiciteUrssaf}
                options={[
                  ["mensuelle", "Mensuelle"],
                  ["trimestrielle", "Trimestrielle"],
                ]}
                onChange={(periodiciteUrssaf) => {
                  setDraft({ ...current, periodiciteUrssaf });
                }}
              />
            </Field>
          </div>
          <Separator />
          <SettingsForm value={current} onChange={setDraft} />
          <ErrorText error={error} />
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
          <Button onClick={addChange}>
            <Save /> Enregistrer au {date(validFrom)}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function BalanceEditor() {
  const snapshots = useApi<BalanceSnapshot[]>("/balance");
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const last = snapshots.data?.at(-1);
  return (
    <Card>
      <form
        className="grid grid-cols-1 gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          api
            .put("/balance", { date: day, amount })
            .then(() => {
              snapshots.reload();
              setError(null);
              toast.success("Solde enregistré");
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err));
            });
        }}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <Landmark className="size-5 text-primary" /> Solde bancaire
          </CardTitle>
          <CardDescription>
            Le solde réel du compte pro à une date ; le cockpit y ajoute ensuite les mouvements
            saisis.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {last !== undefined && (
            <div className="flex items-center justify-between rounded-xl bg-secondary p-4">
              <span className="text-sm text-muted-foreground">
                Dernier relevé, le {date(last.date)}
              </span>
              <span className="num font-serif text-xl font-semibold">{eur(last.amount)}</span>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date">
              <Input
                type="date"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                }}
              />
            </Field>
            <Field label="Solde">
              <MoneyInput value={amount} onChange={setAmount} allowNegative required />
            </Field>
          </div>
          <ErrorText error={error ?? snapshots.error} />
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit">
            <Save /> Enregistrer
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function Reglages({ year }: { year: number }) {
  const timeline = useApi<SettingsTimeline>("/settings");
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon={Settings2}
        title="Réglages"
        description="Tes réglages datés, ton prévisionnel et ton solde de départ"
      />
      <ErrorText error={timeline.error} />
      {timeline.data !== null && (
        <TimelineEditor timeline={timeline.data} onSaved={timeline.reload} />
      )}
      <ProjectionEditor year={year} />
      <BalanceEditor />
    </div>
  );
}
