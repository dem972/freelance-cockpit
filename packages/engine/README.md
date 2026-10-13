# @fc/engine

Pure calculation engine shared by the browser (simulator) and the API (real-mode provisions).

## Invariants

- Pure functions: `(input, settings timeline, year) → Breakdown`. No network, disk, or implicit
  date (`new Date()` without arguments is forbidden; the date is a parameter).
- All amounts are integer **cents** (`Cents` from `@fc/shared`). No floats for money.
- Rounding: `applyRate` rounds half away from zero to the cent. No intermediate rounding to the
  euro (impots.gouv and Urssaf round to the euro: results may differ by a few euros).
- Rates and thresholds live in `rates/<year>.json`, validated by `RateTable`. Each entry carries
  `value`, `unit`, `source_url`, `verified_on`, `note`, and `flag` when a value is unverified or
  official sources disagree. No rate is hard-coded in TypeScript.
- Every `Breakdown` lists the exact sourced rates it used (`rates`), its `warnings` and its
  `assumptions`, so the UI can show them next to the numbers.

## Settings timeline

User settings (statut, caisse, VFL, Acre, TVA, parts, autres revenus…) are a list of dated patches
(`SettingsTimeline`). `settingsAt(timeline, date)` resolves the settings in effect on a date. The
engine computes month by month with the settings in effect on the 1st of each month; the income
tax uses the household settings in effect on 31 December.

## Micro-BNC (J1)

| Élément        | Règle                                                                                                                                                   | Source                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Cotisations    | 25,6 % du CA encaissé (régime général), 23,2 % (Cipav)                                                                                                  | urssaf.fr, actualité mise à jour le 30/01/2026 |
| Acre           | 12,8 % / 13,4 % (début avant le 01/07/2026), 19,2 % / 17,4 % (à partir du 01/07/2026), jusqu'à la fin du 3e trimestre civil suivant le début d'activité | autoentrepreneur.urssaf.fr                     |
| CFP            | 0,2 % du CA                                                                                                                                             | autoentrepreneur.urssaf.fr                     |
| VFL            | 2,2 % du CA, éligibilité selon le RFR N-2                                                                                                               | service-public F23267                          |
| Impôt sans VFL | barème sur CA − abattement 34 % (min. 305 €), en marginal sur le foyer                                                                                  | service-public F23267, F1419, F2705, F34328    |
| TVA            | franchise 37 500 € / seuil majoré 41 250 € ; taux normal 20 %                                                                                           | service-public F21746, impots.gouv             |
| Plafond micro  | 83 600 €                                                                                                                                                | autoentrepreneur.urssaf.fr                     |

### Hypothèses

The list is exported as `MICRO_ASSUMPTIONS` and shown in the UI. In addition:

- The impôt attributed to the activity is **marginal**: tax of the household with the activity
  minus tax without it. Mon-entreprise uses the household average rate instead; both agree when
  there is no other income.
- Not modelled: réductions/crédits d'impôt, demi-parts spécifiques (parent isolé, invalidité),
  seuil de recouvrement (61 €), CEHR, CFE (local, enter it as a frais pro), cotisations minimales
  (none in micro).
- The 2026 income tax uses the barème of the loi de finances 2026 (revenus 2025) until the 2027
  law is published: flagged as an estimate in the warnings.

### Points à surveiller

- `micro.vl.plafond_rfr_par_part` is flagged `conflict`: service-public gives 29 579 €,
  modele-social 11.1.0 gives 29 315 €.

## EURL IR, EURL IS, SASU, portage (J3)

Entry point: `@fc/engine/societe` (`computeSociete`, `computeStatut`, `compareStatuts`), kept
separate so the Micro-BNC path does not load the rules.

- Social contributions, IS, dividend prélèvements and taxable income come from **modele-social
  11.1.0**, the official Urssaf rules behind mon-entreprise.urssaf.fr (MIT, pure in-memory). Hand
  coding the ~60 TNS and payroll rates would be less reliable than using Urssaf's own model. The
  rates shown for these statuts carry the rule's official reference and the package publication
  date (16/07/2026) as `verified_on`.
- Income tax uses this engine's barème, marginal on the household, as for Micro-BNC.
- EURL IS / SASU: `partRemuneration` of (CA − charges) is the dirigeant's total pay cost; the
  rest, after IS, is distributed. Dividend tax = the cheaper of PFU and barème.
- EURL IS: modele-social does not charge TNS contributions on dividends above 10 % of capital +
  comptes courants. We estimate them as the extra contributions of a gérant whose net pay would
  grow by that excess (`estimation_dividendes_tns` warning).
- Portage: the enveloppe (CA − frais de gestion − frais pro) is the total employer cost of a
  salaried cadre. Returned as a **fourchette** over frais de gestion of 5 % to 10 % (market
  practice, not a regulated rate; the user's own value is the central figure).
- Annual computation with the settings of 1 January, spread over months pro rata of CA.

## Tests

- Unit tests on the examples published by the sources (Acre end dates, barème, décote, plafond du
  quotient familial) and on thresholds (TVA seuil and seuil majoré, plafond micro).
- `oracle.test.ts` compares the engine with **modele-social** (the Urssaf rules behind
  mon-entreprise.urssaf.fr, dev dependency only) over a grid of CA × VFL × foyer × caisse.
  Tolerance: 6 € on yearly contributions (the oracle rounds each month to the euro) and 2 € on
  the impôt.
