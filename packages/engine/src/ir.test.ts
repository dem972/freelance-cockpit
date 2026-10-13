import { describe, expect, it } from "vitest";
import type { Cents } from "@fc/shared";
import { impotRevenu } from "./ir.js";
import { Rates } from "./rates.js";

const rates = new Rates(2026);
const eur = (n: number) => (n * 100) as Cents;

describe("impotRevenu (exemples service-public, revenus 2025)", () => {
  it("30 000 € pour 1 part → 2 103,99 € (F1419, pas de décote au-dessus de 1 982 €)", () => {
    const impot = impotRevenu(eur(30_000), { parts: 1, situationFamiliale: "seul" }, rates);
    expect(impot).toBe(210399);
  });

  it("0 € → 0 €", () => {
    expect(impotRevenu(0 as Cents, { parts: 1, situationFamiliale: "seul" }, rates)).toBe(0);
  });

  it("décote : impôt brut 1 400 € → 1 136,50 € (F34328)", () => {
    // Revenu donnant 1 400 € de barème brut pour 1 part : 11 600 + 1 400 / 11 %.
    const revenu = Math.round((11_600 + 1_400 / 0.11) * 100) as Cents;
    const impot = impotRevenu(revenu, { parts: 1, situationFamiliale: "seul" }, rates);
    expect(impot / 100).toBeCloseTo(1136.5, 0);
  });

  it("plafonne l'avantage du quotient familial à 1 807 € par demi-part", () => {
    const sansEnfant = impotRevenu(eur(150_000), { parts: 2, situationFamiliale: "couple" }, rates);
    const avecEnfant = impotRevenu(
      eur(150_000),
      { parts: 2.5, situationFamiliale: "couple" },
      rates,
    );
    expect(sansEnfant - avecEnfant).toBe(180700);
  });
});
