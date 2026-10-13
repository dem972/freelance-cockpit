import type { Cents } from "@fc/shared";
import type { MonthInput } from "./types.js";

export interface SimulationInput {
  /** Taux journalier HT, en centimes. */
  tjm: Cents;
  /** Jours facturés par mois : un nombre (tous les mois) ou 12 valeurs. */
  joursParMois: number | readonly number[];
  /** Frais professionnels HT par mois, en centimes. */
  fraisProMensuels: Cents;
}

/** Builds the 12 monthly inputs of a simulation (CA = TJM × jours). */
export function monthsFromTjm(input: SimulationInput): MonthInput[] {
  return Array.from({ length: 12 }, (_, i) => {
    const jours =
      typeof input.joursParMois === "number" ? input.joursParMois : (input.joursParMois[i] ?? 0);
    return {
      month: i + 1,
      ca: Math.round(input.tjm * jours) as Cents,
      fraisPro: input.fraisProMensuels,
    };
  });
}
