import type { Projection } from "@fc/shared";
import { isJourOuvre, joursOuvres } from "./calendar.js";

/**
 * Planned billable days per month. From the calendar: working days (Mon–Fri
 * minus public holidays) minus the days off taken on working days. Otherwise
 * the 12 values entered by hand.
 */
export function joursPrevus(projection: Projection): number[] {
  if (!projection.joursDepuisCalendrier) return projection.joursParMois;
  const conges = new Set(projection.conges.filter(isJourOuvre));
  return Array.from({ length: 12 }, (_, i) => {
    const jours = joursOuvres(projection.year, i + 1);
    return jours.filter((d) => !conges.has(d)).length;
  });
}
