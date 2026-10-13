import { useState } from "react";
import { isJourOuvre, joursFeries, joursPrevus } from "@fc/engine";
import type { Cents, Projection } from "@fc/shared";
import { api, useApi } from "../lib/api.js";
import { eur, MONTHS } from "../lib/format.js";
import { ErrorText } from "./ErrorText.js";
import { Field } from "./Field.js";
import { MoneyInput } from "./MoneyInput.js";

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

/** One month grid; working days are clickable to toggle a day off. */
function MonthGrid({
  year,
  month,
  conges,
  feries,
  onToggle,
}: {
  year: number;
  month: number;
  conges: Set<string>;
  feries: Set<string>;
  onToggle: (day: string) => void;
}) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Monday-first offset.
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => `${String(year)}-${pad(month)}-${pad(i + 1)}`),
  ];
  return (
    <div className="month">
      <div className="month-title">{MONTHS[month - 1]}</div>
      <div className="month-grid">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <span key={`h${String(i)}`} className="dow">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${String(i)}`} />;
          const ouvre = isJourOuvre(day);
          const off = conges.has(day);
          const label = `${day}${feries.has(day) ? " (férié)" : ""}${off ? " (congé)" : ""}`;
          return ouvre ? (
            <button
              key={day}
              type="button"
              className={`day${off ? " off" : ""}`}
              aria-pressed={off}
              aria-label={label}
              title={label}
              onClick={() => {
                onToggle(day);
              }}
            >
              {Number(day.slice(8))}
            </button>
          ) : (
            <span
              key={day}
              className={`day closed${feries.has(day) ? " ferie" : ""}`}
              title={label}
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
  const [saved, setSaved] = useState(false);
  if (stored.data === null && stored.error === null) return null;
  const p = draft ?? stored.data ?? emptyProjection(year);
  const edit = (next: Projection) => {
    setDraft(next);
    setSaved(false);
  };
  const conges = new Set(p.conges);
  const feries = new Set(joursFeries(year));
  const jours = joursPrevus(p);
  const total = jours.reduce((a, b) => a + b, 0);

  return (
    <section className="card">
      <h3>Prévisionnel {year}</h3>
      <p className="muted small">
        Sert pour les mois pas encore réalisés : CA projeté, taux d'impôt à provisionner, net
        projeté du cockpit.
      </p>
      <div className="grid-3">
        <Field label="TJM HT (€)">
          <MoneyInput
            value={p.tjm}
            onChange={(v) => {
              edit({ ...p, tjm: v as Cents });
            }}
          />
        </Field>
        <Field label="Frais pro HT / mois (€)">
          <MoneyInput
            value={p.fraisMensuels}
            onChange={(v) => {
              edit({ ...p, fraisMensuels: v as Cents });
            }}
          />
        </Field>
        <Field label="Jours facturés">
          <select
            value={p.joursDepuisCalendrier ? "calendrier" : "manuel"}
            onChange={(e) => {
              edit({ ...p, joursDepuisCalendrier: e.target.value === "calendrier" });
            }}
          >
            <option value="calendrier">Calendrier : jours ouvrés − congés</option>
            <option value="manuel">Saisie par mois</option>
          </select>
        </Field>
      </div>

      {p.joursDepuisCalendrier ? (
        <>
          <p className="small">
            Clique sur les jours de congé. Week-ends et jours fériés sont exclus d'office.{" "}
            <strong>
              {total} jours facturables, {p.conges.filter(isJourOuvre).length} jours de congé.
            </strong>
          </p>
          <div className="months">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i}>
                <MonthGrid
                  year={year}
                  month={i + 1}
                  conges={conges}
                  feries={feries}
                  onToggle={(day) => {
                    const next = conges.has(day)
                      ? p.conges.filter((d) => d !== day)
                      : [...p.conges, day].sort();
                    edit({ ...p, conges: next });
                  }}
                />
                <p className="small muted num">
                  {jours[i]} j · {eur(p.tjm * (jours[i] ?? 0))}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="grid-6">
          {MONTHS.map((m, i) => (
            <Field key={m} label={m}>
              <input
                type="number"
                min={0}
                max={31}
                step={0.5}
                value={p.joursParMois[i]}
                onChange={(e) => {
                  const next = [...p.joursParMois];
                  next[i] = Number(e.target.value);
                  edit({ ...p, joursParMois: next });
                }}
              />
            </Field>
          ))}
        </div>
      )}

      <p className="num">
        CA projeté sur l'année : <strong>{eur(p.tjm * total)}</strong>
      </p>
      <div className="row">
        <button
          type="button"
          disabled={draft === null}
          onClick={() => {
            api
              .put(`/projections/${String(year)}`, p)
              .then(() => {
                setDraft(null);
                setSaved(true);
                setError(null);
                stored.reload();
              })
              .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : String(e));
              });
          }}
        >
          Enregistrer le prévisionnel
        </button>
        {saved && <span className="muted small">Enregistré.</span>}
      </div>
      <ErrorText error={error ?? stored.error} />
    </section>
  );
}
