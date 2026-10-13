import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Cents, type Settings } from "@fc/shared";
import { monthsFromTjm } from "./simulate.js";
import { compareStatuts, computeSociete, type SocieteStatut } from "./societe.js";
import { evaluate } from "../test/oracle.js";

const eur = (n: number) => (n * 100) as Cents;
const input = (caMensuel: number, settings: Partial<Settings> = {}, fraisMensuels = 150) => ({
  year: 2026,
  months: monthsFromTjm({
    tjm: eur(caMensuel),
    joursParMois: 1,
    fraisProMensuels: eur(fraisMensuels),
  }),
  timeline: [{ validFrom: "2026-01-01", settings: { ...DEFAULT_SETTINGS, ...settings } }],
});
const STATUTS: SocieteStatut[] = ["eurl_ir", "eurl_is", "sasu", "portage"];

describe("computeSociete", () => {
  it.each(STATUTS)("%s: net = CA − frais − cotisations − impôt, months sum to totals", (statut) => {
    const r = computeSociete(input(9_000), statut);
    expect(r.net).toBe(r.ca - r.fraisPro - r.cotisations - r.impot);
    expect(r.months.reduce((a, m) => a + m.cotisations, 0)).toBe(r.cotisations);
    expect(r.months.reduce((a, m) => a + m.impot, 0)).toBe(r.impot);
    expect(r.net).toBeGreaterThan(0);
    expect(r.net).toBeLessThan(r.ca);
  });

  it("EURL IR: impôt equals mon-entreprise's (no other household income)", () => {
    const r = computeSociete(input(9_000), "eurl_ir");
    const oracle = evaluate(
      {
        date: "'01/01/2026'",
        "entreprise . date de création": "'01/01/2020'",
        "entreprise . activité . nature": "'libérale'",
        "entreprise . activité . nature . libérale . réglementée": "non",
        "entreprise . catégorie juridique": "'SARL'",
        "entreprise . associés": "'unique'",
        "entreprise . imposition": "'IR'",
        "entreprise . imposition . IR . type de bénéfices": "'BNC'",
        "entreprise . chiffre d'affaires": "108000 €/an",
        "entreprise . charges": "1800 €/an",
        "impôt . méthode de calcul": "'barème standard'",
      },
      "impôt . montant",
    );
    expect(Math.abs(r.impot / 100 - oracle)).toBeLessThanOrEqual(2);
  });

  it("SASU: all in dividends vs all in salary changes IS and dividends", () => {
    const salaire = computeSociete(input(9_000, { partRemuneration: 1 }), "sasu");
    const dividendes = computeSociete(input(9_000, { partRemuneration: 0 }), "sasu");
    expect(salaire.details?.dividendesBruts).toBe(0);
    expect(dividendes.details?.dividendesBruts).toBeGreaterThan(0);
    expect(dividendes.details?.is).toBeGreaterThan(salaire.details?.is ?? 0);
  });

  it("EURL IS: dividends above 10 % of capital add TNS contributions", () => {
    const petitCapital = computeSociete(input(9_000, { partRemuneration: 0.3 }), "eurl_is");
    const grosCapital = computeSociete(
      input(9_000, { partRemuneration: 0.3, capitalEtComptesCourants: eur(1_000_000) }),
      "eurl_is",
    );
    expect(petitCapital.warnings.map((w) => w.code)).toContain("estimation_dividendes_tns");
    expect(grosCapital.warnings.map((w) => w.code)).not.toContain("estimation_dividendes_tns");
    expect(petitCapital.cotisations).toBeGreaterThan(grosCapital.cotisations);
  });

  it("portage: fourchette ordered and containing the central value", () => {
    const r = computeSociete(input(9_000, { fraisGestionPortage: 0.07 }), "portage");
    expect(r.netRange).toBeDefined();
    expect(r.netRange?.min).toBeLessThanOrEqual(r.net);
    expect(r.netRange?.max).toBeGreaterThanOrEqual(r.net);
  });

  it("lists sourced rates for IS and dividends", () => {
    const r = computeSociete(input(9_000, { partRemuneration: 0.5 }), "sasu");
    const keys = r.rates.map((x) => x.key);
    expect(keys).toEqual(
      expect.arrayContaining(["societe.is.taux_reduit", "societe.dividendes.pfu"]),
    );
    expect(r.rates.every((x) => x.source_url.startsWith("https://"))).toBe(true);
  });

  it("compareStatuts returns the five statuts", () => {
    expect(compareStatuts(input(5_000)).map((b) => b.statut)).toEqual([
      "micro_bnc",
      "eurl_ir",
      "eurl_is",
      "sasu",
      "portage",
    ]);
  });

  it("zero CA does not crash and gives no negative tax", () => {
    for (const b of compareStatuts(input(0, {}, 0))) {
      expect(b.impot).toBeGreaterThanOrEqual(0);
    }
  });
});
