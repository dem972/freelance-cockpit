import type { Cents, Settings } from "@fc/shared";
import { applyRate } from "./money.js";
import type { Rates } from "./rates.js";

/** Progressive barème applied to one part of income. */
function baremeParPart(revenuParPart: number, rates: Rates): number {
  const seuils = [1, 2, 3, 4].map((i) => rates.cents(`ir.bareme.seuil.${String(i)}`));
  const taux = [1, 2, 3, 4, 5].map((i) => rates.rate(`ir.bareme.taux.${String(i)}`));
  let impot = 0;
  let bas = 0;
  for (let i = 0; i < taux.length; i++) {
    const haut = seuils[i] ?? Number.POSITIVE_INFINITY;
    if (revenuParPart > bas) impot += (Math.min(revenuParPart, haut) - bas) * (taux[i] ?? 0);
    bas = haut;
  }
  return impot;
}

/**
 * Impôt sur le revenu du foyer (barème, quotient familial plafonné, décote).
 * Not modelled: réductions/crédits d'impôt, demi-parts spécifiques (parent
 * isolé, invalidité), seuil de mise en recouvrement, CEHR.
 */
export function impotRevenu(
  revenuImposable: Cents,
  foyer: Pick<Settings, "parts" | "situationFamiliale">,
  rates: Rates,
): Cents {
  if (revenuImposable <= 0) return 0 as Cents;
  const partsBase = foyer.situationFamiliale === "couple" ? 2 : 1;
  const parts = Math.max(foyer.parts, partsBase);

  const avecQf = baremeParPart(revenuImposable / parts, rates) * parts;
  const sansQf = baremeParPart(revenuImposable / partsBase, rates) * partsBase;
  // Plafond per half-part beyond the base parts; a quarter part counts for half.
  const plafond = (parts - partsBase) * 2 * rates.cents("ir.plafond_demi_part");
  let impot = Math.max(avecQf, sansQf - plafond);

  const forfait = rates.cents(
    foyer.situationFamiliale === "couple" ? "ir.decote.forfait.couple" : "ir.decote.forfait.seul",
  );
  const decote = forfait - impot * rates.rate("ir.decote.taux");
  if (decote > 0) impot = Math.max(0, impot - decote);

  return applyRate(Math.round(impot) as Cents, 1);
}
