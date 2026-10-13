import { useMemo } from "react";
import { computeMicroBnc, monthsFromTjm, type Breakdown } from "@fc/engine";
import { DEFAULT_SETTINGS, type Cents, type Settings } from "@fc/shared";
import { BreakdownBar } from "../components/BreakdownBar.js";
import { Field } from "../components/Field.js";
import { RatesPanel } from "../components/RatesPanel.js";
import { SettingsForm } from "../components/SettingsForm.js";
import { Warnings } from "../components/Warnings.js";
import { eur, MONTHS } from "../lib/format.js";
import { useStoredState } from "../lib/storage.js";

const YEAR = 2026;

interface SimState {
  tjm: number;
  jours: number;
  frais: number;
  settings: Settings;
}

const INITIAL: SimState = { tjm: 500, jours: 18, frais: 150, settings: DEFAULT_SETTINGS };

export function Simulator() {
  const [state, setState] = useStoredState<SimState>("fc.simulator", INITIAL);
  const { tjm, jours, frais, settings } = state;

  const result: Breakdown = useMemo(
    () =>
      computeMicroBnc({
        year: YEAR,
        months: monthsFromTjm({
          tjm: Math.round(tjm * 100) as Cents,
          joursParMois: jours,
          fraisProMensuels: Math.round(frais * 100) as Cents,
        }),
        timeline: [{ validFrom: `${String(YEAR)}-01-01`, settings }],
      }),
    [tjm, jours, frais, settings],
  );

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

      <section className="card result">
        <p className="muted">Ce qui reste pour toi sur l'année</p>
        <p className="hero num">{eur(result.net)}</p>
        <p className="muted num">
          soit {eur(result.net / 12)} / mois · CA {eur(result.ca)}
        </p>
        <BreakdownBar b={result} />
        <Warnings warnings={result.warnings} />
      </section>

      <section className="card">
        <h3>Détail mensuel</h3>
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
    </div>
  );
}
