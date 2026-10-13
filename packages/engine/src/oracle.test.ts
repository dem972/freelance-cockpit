import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Cents, type Settings } from "@fc/shared";
import { computeMicroBnc } from "./micro.js";
import { evaluate, microSituation, ORACLE_VERSION, type MicroCase } from "../test/oracle.js";

const FOYERS = {
  seul: { situationFamiliale: "seul", parts: 1 },
  couple: { situationFamiliale: "couple", parts: 2 },
  "couple+1": { situationFamiliale: "couple", parts: 2.5 },
  "couple+2": { situationFamiliale: "couple", parts: 3 },
} as const;

function engine(c: MicroCase) {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    caisse: c.cipav === true ? "cipav" : "regime_general",
    versementLiberatoire: c.vl === true,
    ...FOYERS[c.foyer ?? "seul"],
  };
  const monthly = Math.round((c.ca * 100) / 12);
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    // Put the rounding remainder on December so the year sums to the exact CA.
    ca: (i === 11 ? c.ca * 100 - monthly * 11 : monthly) as Cents,
    fraisPro: 0 as Cents,
  }));
  return computeMicroBnc({ year: 2026, months, timeline: [{ validFrom: "2026-01-01", settings }] });
}

const CAS = [0, 300, 5_000, 15_000, 29_579, 37_500, 41_250, 50_000, 60_000, 83_600, 100_000];
const cases: MicroCase[] = [];
for (const ca of CAS) {
  for (const vl of [false, true]) {
    for (const foyer of Object.keys(FOYERS) as (keyof typeof FOYERS)[]) {
      cases.push({ ca, vl, foyer });
    }
  }
  cases.push({ ca, cipav: true });
}

const euros = (cents: number) => cents / 100;
const label = (c: MicroCase) =>
  `CA ${String(c.ca)} €, ${c.cipav === true ? "Cipav" : "RG"}, VL ${c.vl === true ? "oui" : "non"}, ${c.foyer ?? "seul"}`;

describe(`Micro-BNC 2026 vs ${ORACLE_VERSION}`, () => {
  it.each(cases.map((c) => [label(c), c] as const))("%s", (_, c) => {
    const r = engine(c);
    const s = microSituation(c);
    const base = "dirigeant . auto-entrepreneur . cotisations et contributions";
    // The oracle rounds each month to the euro: up to 12 × 0,50 € apart over a year.
    const MONTHLY_ROUNDING = 6;
    expect(
      Math.abs(euros(r.cotisations) - evaluate(s, `${base} . cotisations`)),
    ).toBeLessThanOrEqual(MONTHLY_ROUNDING);
    expect(Math.abs(euros(r.cfp) - evaluate(s, `${base} . CFP`))).toBeLessThanOrEqual(
      MONTHLY_ROUNDING,
    );
    if (c.cipav !== true) {
      // Within 2 € (the oracle rounds to the euro).
      expect(Math.abs(euros(r.impot) - evaluate(s, "impôt . montant"))).toBeLessThanOrEqual(2);
    }
  });
});
