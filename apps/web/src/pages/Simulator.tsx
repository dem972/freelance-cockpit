import { monthsFromTjm, type YearInput } from "@fc/engine";
import {
  DEFAULT_SETTINGS,
  STATUT_LABELS,
  type Cents,
  type Settings,
  type Statut,
} from "@fc/shared";
import { BreakdownBar } from "../components/BreakdownBar.js";
import { Field } from "../components/Field.js";
import { RatesPanel } from "../components/RatesPanel.js";
import { SettingsForm } from "../components/SettingsForm.js";
import { StatutCompare } from "../components/StatutCompare.js";
import { Warnings } from "../components/Warnings.js";
import { eur, MONTHS } from "../lib/format.js";
import { useStoredState } from "../lib/storage.js";
import { useCompare } from "../lib/useCompare.js";

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

  const num = (key: "tjm" | "jours" | "frais") => (e: React.ChangeEvent<HTMLInputElement>) => {
    setState({ ...state, [key]: Math.max(0, Number(e.target.value)) });
  };

  return (
    <div className="layout">
      <section className="card inputs">
        <h2>Simulateur {YEAR}</h2>
        <div className="grid-3">
          <Field label="TJM HT (€)">
            <input type="number" min={0} step={10} value={tjm} onChange={num("tjm")} />
          </Field>
          <Field label="Jours facturés / mois">
            <input
              type="number"
              min={0}
              max={31}
              step={0.5}
              value={jours}
              onChange={num("jours")}
            />
          </Field>
          <Field label="Frais pro HT / mois (€)">
            <input type="number" min={0} step={10} value={frais} onChange={num("frais")} />
          </Field>
        </div>
        <details>
          <summary>Options avancées</summary>
          <SettingsForm
            value={settings}
            onChange={(s) => {
              setState({ ...state, settings: s });
            }}
          />
        </details>
      </section>

      <section className={`card result${pending ? " pending" : ""}`} aria-busy={pending}>
        {error !== null && <p className="error">Erreur de calcul : {error}</p>}
        {result === null ? (
          <p className="muted">Calcul en cours…</p>
        ) : (
          <>
            <p className="muted">{STATUT_LABELS[statut]} : ce qui reste pour toi sur l'année</p>
            <p className="hero num">{eur(result.net)}</p>
            {result.netRange !== undefined && (
              <p className="num">
                Fourchette : {eur(result.netRange.min)} – {eur(result.netRange.max)}
              </p>
            )}
            <p className="muted num">
              soit {eur(result.net / 12)} / mois · CA {eur(result.ca)}
            </p>
            <BreakdownBar b={result} />
            <Warnings warnings={result.warnings} />
          </>
        )}
      </section>

      {all !== null && (
        <StatutCompare
          results={all}
          selected={statut}
          onSelect={(s) => {
            setState({ ...state, statut: s });
          }}
        />
      )}

      {result !== null && (
        <>
          <section className="card">
            <h3>Détail mensuel : {STATUT_LABELS[statut]}</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>CA</th>
                    <th>Cotisations</th>
                    <th>CFP</th>
                    <th>Impôt</th>
                    <th>TVA due</th>
                  </tr>
                </thead>
                <tbody>
                  {result.months.map((m) => (
                    <tr key={m.month}>
                      <td>
                        {MONTHS[m.month - 1]}
                        {m.acre && <span className="badge">Acre</span>}
                      </td>
                      <td className="num">{eur(m.ca)}</td>
                      <td className="num">{eur(m.cotisations)}</td>
                      <td className="num">{eur(m.cfp)}</td>
                      <td className="num">{eur(m.impot)}</td>
                      <td className="num">{eur(m.tvaCollectee - m.tvaDeductible)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <RatesPanel rates={result.rates} />

          <section className="card">
            <details>
              <summary>Hypothèses de calcul</summary>
              <ul className="small">
                {result.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
