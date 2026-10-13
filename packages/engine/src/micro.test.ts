import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Cents, type Settings, type SettingsTimeline } from "@fc/shared";
import { computeMicroBnc } from "./micro.js";
import { monthsFromTjm } from "./simulate.js";

const eur = (n: number) => (n * 100) as Cents;
const tl = (patch: Partial<Settings> = {}, ...later: SettingsTimeline): SettingsTimeline => [
  { validFrom: "2026-01-01", settings: { ...DEFAULT_SETTINGS, ...patch } },
  ...later,
];
const flat = (caMensuel: number, fraisMensuels = 0) =>
  monthsFromTjm({ tjm: eur(caMensuel), joursParMois: 1, fraisProMensuels: eur(fraisMensuels) });

describe("computeMicroBnc", () => {
  it("60 000 € de CA, 1 part, sans VL : 25,6 % + 0,2 % CFP, impôt au barème", () => {
    const r = computeMicroBnc({ year: 2026, months: flat(5_000), timeline: tl() });
    expect(r.ca).toBe(eur(60_000));
    expect(r.cotisations).toBe(eur(15_360));
    expect(r.cfp).toBe(eur(120));
    // (39 600 − 29 579) × 30 % + (29 579 − 11 600) × 11 % = 4 983,99 €
    expect(r.impot).toBe(498399);
    expect(r.net).toBe(eur(60_000) - eur(15_360) - eur(120) - 498399);
  });

  it("subtracts frais pro from the net without changing contributions", () => {
    const r = computeMicroBnc({ year: 2026, months: flat(5_000, 200), timeline: tl() });
    expect(r.cotisations).toBe(eur(15_360));
    expect(r.fraisPro).toBe(eur(2_400));
  });

  it("applies the VFL monthly at 2,2 %", () => {
    const r = computeMicroBnc({
      year: 2026,
      months: flat(5_000),
      timeline: tl({ versementLiberatoire: true }),
    });
    expect(r.impot).toBe(eur(1_320));
    expect(r.months.every((m) => m.impot === eur(110))).toBe(true);
  });

  it("Acre (début 15/03/2026, avant bascule) : 12,8 % jusqu'au 31/12/2026", () => {
    const r = computeMicroBnc({
      year: 2026,
      months: flat(1_000),
      timeline: tl({ acreDebutActivite: "2026-03-15" }),
    });
    expect(r.months[1]?.acre).toBe(false);
    expect(r.months[2]?.tauxCotisations).toBe(0.128);
    expect(r.months[11]?.tauxCotisations).toBe(0.128);
    expect(r.months[0]?.tauxCotisations).toBe(0.256);
  });

  it("Acre (début 01/09/2026, après bascule) : 19,2 %", () => {
    const r = computeMicroBnc({
      year: 2026,
      months: flat(1_000),
      timeline: tl({ acreDebutActivite: "2026-09-01" }),
    });
    expect(r.months[8]?.tauxCotisations).toBe(0.192);
    expect(r.months[7]?.tauxCotisations).toBe(0.256);
  });

  it("Cipav : 23,2 %", () => {
    const r = computeMicroBnc({
      year: 2026,
      months: flat(1_000),
      timeline: tl({ caisse: "cipav" }),
    });
    expect(r.cotisations).toBe(eur(2_784));
  });

  it("TVA : seuil majoré franchi en cours de mois → TVA sur l'excédent puis sur tout", () => {
    // 5 000 €/mois : cumul 40 000 € fin août, 45 000 € fin septembre.
    const r = computeMicroBnc({ year: 2026, months: flat(5_000), timeline: tl() });
    expect(r.months[7]?.tvaCollectee).toBe(0);
    expect(r.months[8]?.tvaCollectee).toBe(eur(3_750 * 0.2)); // 45 000 − 41 250
    expect(r.months[9]?.tvaCollectee).toBe(eur(1_000));
    expect(r.warnings.map((w) => w.code)).toContain("tva_seuil_majore_depasse");
  });

  it("TVA : seuil de base dépassé sans seuil majoré → avertissement pour N+1", () => {
    const r = computeMicroBnc({ year: 2026, months: flat(3_300), timeline: tl() });
    expect(r.tva.collectee).toBe(0);
    expect(r.warnings.map((w) => w.code)).toContain("tva_seuil_depasse");
  });

  it("assujetti from July: TVA collected and recovered on frais", () => {
    const r = computeMicroBnc({
      year: 2026,
      months: flat(2_000, 100),
      timeline: tl({}, { validFrom: "2026-07-01", settings: { tva: "assujetti" } }),
    });
    expect(r.months[5]?.tvaCollectee).toBe(0);
    expect(r.months[6]?.tvaCollectee).toBe(eur(400));
    expect(r.tva.due).toBe(eur(6 * 400 - 6 * 20));
  });

  it("warns above the micro CA ceiling", () => {
    const r = computeMicroBnc({ year: 2026, months: flat(7_000), timeline: tl() });
    expect(r.warnings.map((w) => w.code)).toContain("plafond_micro_depasse");
    const sous = computeMicroBnc({ year: 2026, months: flat(6_966), timeline: tl() });
    expect(sous.warnings.map((w) => w.code)).not.toContain("plafond_micro_depasse");
  });

  it("warns when the VFL changes mid-year and when the RFR is too high", () => {
    const r = computeMicroBnc({
      year: 2026,
      months: flat(1_000),
      timeline: tl({}, { validFrom: "2026-04-01", settings: { versementLiberatoire: true } }),
      rfrNMoins2: eur(40_000),
    });
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain("vl_changement_en_cours_annee");
    expect(codes).toContain("vl_rfr_trop_eleve");
  });

  it("reports the sourced rates it used", () => {
    const r = computeMicroBnc({ year: 2026, months: flat(1_000), timeline: tl() });
    const keys = r.rates.map((x) => x.key);
    expect(keys).toContain("micro.cotisations.bnc.regime_general");
    expect(r.rates.every((x) => x.source_url.startsWith("https://"))).toBe(true);
  });

  it("allocates the annual barème tax to months pro rata, summing exactly", () => {
    const months = flat(4_000).map((m, i) => ({ ...m, ca: eur(i < 6 ? 2_000 : 6_000) }));
    const r = computeMicroBnc({ year: 2026, months, timeline: tl() });
    expect(r.months.reduce((a, m) => a + m.impot, 0)).toBe(r.impot);
    expect(r.months[11]?.impot).toBeGreaterThan(r.months[0]?.impot ?? 0);
  });
});
