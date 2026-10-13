import { useState } from "react";
import { settingsAt } from "@fc/engine";
import {
  STATUT_LABELS,
  type BalanceSnapshot,
  type Settings,
  type SettingsPatch,
  type SettingsTimeline,
  type Statut,
} from "@fc/shared";
import { ErrorText } from "../components/ErrorText.js";
import { Field } from "../components/Field.js";
import { MoneyInput } from "../components/MoneyInput.js";
import { ProjectionEditor } from "../components/ProjectionEditor.js";
import { SettingsForm } from "../components/SettingsForm.js";
import { api, useApi } from "../lib/api.js";
import { date, eur } from "../lib/format.js";

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

function describe(patch: SettingsPatch["settings"]): string {
  return Object.entries(patch)
    .map(([k, v]) => {
      const label = FIELD_LABELS[k as keyof Settings];
      if (k === "statut") return `${label} : ${STATUT_LABELS[v as Statut]}`;
      if (typeof v === "boolean") return `${label} : ${v ? "oui" : "non"}`;
      if (k === "autresRevenusImposables" || k === "capitalEtComptesCourants") {
        return `${label} : ${eur(v as number)}`;
      }
      return `${label} : ${String(v ?? "aucune")}`;
    })
    .join(" · ");
}

/** Only the settings that differ from those already in effect. */
function diff(before: Settings, after: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof Settings)[]) {
    if (after[key] !== before[key]) out[key] = after[key];
  }
  return out;
}

function StatutSelect({ value, onChange }: { value: Statut; onChange: (s: Statut) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => {
        onChange(e.target.value as Statut);
      }}
    >
      {(Object.keys(STATUT_LABELS) as Statut[]).map((s) => (
        <option key={s} value={s}>
          {STATUT_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

function PeriodiciteSelect({ s, onChange }: { s: Settings; onChange: (s: Settings) => void }) {
  return (
    <select
      value={s.periodiciteUrssaf}
      onChange={(e) => {
        onChange({ ...s, periodiciteUrssaf: e.target.value as Settings["periodiciteUrssaf"] });
      }}
    >
      <option value="mensuelle">Mensuelle</option>
      <option value="trimestrielle">Trimestrielle</option>
    </select>
  );
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

  const save = (next: SettingsTimeline) => {
    setError(null);
    api
      .put("/settings", next)
      .then(() => {
        setDraft(null);
        onSaved();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  };

  const addChange = () => {
    const first = sorted[0];
    if (first !== undefined && validFrom <= first.validFrom) {
      // Before (or on) the first date: becomes the new complete starting point.
      save([{ validFrom, settings: current }, ...sorted.filter((p) => p.validFrom !== validFrom)]);
      return;
    }
    const changes = diff(effective, current);
    if (Object.keys(changes).length === 0) {
      setError("Aucun changement par rapport aux réglages en vigueur à cette date.");
      return;
    }
    const existing = sorted.find((p) => p.validFrom === validFrom);
    const patch = { validFrom, settings: { ...(existing?.settings ?? {}), ...changes } };
    save([...sorted.filter((p) => p.validFrom !== validFrom), patch]);
  };

  return (
    <section className="card">
      <h3>Réglages datés</h3>
      <p className="muted small">
        Chaque changement s'applique à partir de sa date (au mois près) : fin d'Acre, passage à la
        TVA, option VFL, changement de statut, mariage…
      </p>
      <ol className="timeline">
        {sorted.map((p, i) => (
          <li key={p.validFrom}>
            <strong>{date(p.validFrom)}</strong>{" "}
            {i === 0 ? <span className="badge">départ</span> : null}
            <p className="small">{i === 0 ? "Réglages initiaux complets" : describe(p.settings)}</p>
            {i > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  save(sorted.filter((x) => x.validFrom !== p.validFrom));
                }}
              >
                Retirer
              </button>
            )}
          </li>
        ))}
      </ol>

      <h4>Ajouter ou modifier à une date</h4>
      <div className="grid-3">
        <Field label="À partir du">
          <input
            type="date"
            value={validFrom}
            onChange={(e) => {
              setValidFrom(e.target.value);
              setDraft(null);
            }}
          />
        </Field>
        <Field label="Statut">
          <StatutSelect
            value={current.statut}
            onChange={(statut) => {
              setDraft({ ...current, statut });
            }}
          />
        </Field>
        <Field label="Périodicité Urssaf (micro)">
          <PeriodiciteSelect s={current} onChange={setDraft} />
        </Field>
      </div>
      <SettingsForm value={current} onChange={setDraft} />
      <div className="row">
        <button type="button" onClick={addChange}>
          Enregistrer à cette date
        </button>
        {draft !== null && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setDraft(null);
            }}
          >
            Annuler
          </button>
        )}
      </div>
      <ErrorText error={error} />
    </section>
  );
}

function BalanceEditor() {
  const snapshots = useApi<BalanceSnapshot[]>("/balance");
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const last = snapshots.data?.at(-1);
  return (
    <section className="card">
      <h3>Solde bancaire</h3>
      <p className="muted small">
        Saisis le solde réel du compte pro à une date ; le cockpit y ajoute ensuite les mouvements
        saisis.
        {last !== undefined && ` Dernier relevé : ${eur(last.amount)} le ${date(last.date)}.`}
      </p>
      <form
        className="grid-3"
        onSubmit={(e) => {
          e.preventDefault();
          api
            .put("/balance", { date: day, amount })
            .then(() => {
              snapshots.reload();
              setError(null);
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err));
            });
        }}
      >
        <Field label="Date">
          <input
            type="date"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
            }}
          />
        </Field>
        <Field label="Solde (€)">
          <MoneyInput value={amount} onChange={setAmount} allowNegative required />
        </Field>
        <div className="field">
          <button type="submit">Enregistrer</button>
        </div>
      </form>
      <ErrorText error={error ?? snapshots.error} />
    </section>
  );
}

export function Reglages({ year }: { year: number }) {
  const timeline = useApi<SettingsTimeline>("/settings");
  return (
    <div className="stack">
      <ErrorText error={timeline.error} />
      {timeline.data !== null && (
        <TimelineEditor timeline={timeline.data} onSaved={timeline.reload} />
      )}
      <ProjectionEditor year={year} />
      <BalanceEditor />
    </div>
  );
}
