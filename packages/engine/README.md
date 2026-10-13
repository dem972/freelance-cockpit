# @fc/engine

Pure calculation engine shared by the browser (simulator) and the API (real-mode provisions).

## Invariants

- Pure functions: `(input, status, year, options) → breakdown`. No network, disk, or implicit
  date (`new Date()` is forbidden; the date is a parameter).
- All amounts are integer **cents** (`Cents` from `@fc/shared`). No floats for money.
- Rounding: `applyRate` rounds half away from zero to the cent. Any other rule must be documented
  next to its use and in this file.
- Rates and thresholds live in `rates/<year>.json`, validated by `RateTable`. Each entry carries
  `value`, `source_url`, `verified_on`, `note`. No rate is ever hard-coded in TypeScript.

## Assumptions

_None yet. Every modelling assumption (J1+) is listed here with its source._
