import type { IsoDate } from "@fc/shared";
import { monthEnd, parseIso } from "./dates.js";

/**
 * Last day of the Acre reduced rate for an auto-entrepreneur: the end of the
 * 3rd calendar quarter following the quarter of the start of activity.
 * Source: autoentrepreneur.urssaf.fr, "L'essentiel du statut" (création le
 * 20/02/2023 → 31/12/2023 ; création le 03/04/2023 → 31/03/2024).
 */
export function acreEndDate(debutActivite: IsoDate): IsoDate {
  const { year, month } = parseIso(debutActivite);
  const quarter = Math.floor((month - 1) / 3) + 3;
  const endYear = year + Math.floor(quarter / 4);
  const endMonth = (quarter % 4) * 3 + 3;
  return monthEnd(endYear, endMonth);
}

/** True if the month overlaps the Acre period (start of activity → end date). */
export function acreActiveInMonth(debutActivite: IsoDate, year: number, month: number): boolean {
  const first = `${String(year)}-${String(month).padStart(2, "0")}-01`;
  return debutActivite <= monthEnd(year, month) && first <= acreEndDate(debutActivite);
}
