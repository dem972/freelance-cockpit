import type { IsoDate } from "@fc/shared";
import { nextJourOuvre } from "./calendar.js";
import { monthEnd, monthStart } from "./dates.js";

export interface Periode {
  start: IsoDate;
  end: IsoDate;
  /** Date d'exigibilité, reportée au jour ouvré suivant si besoin. */
  dueOn: IsoDate;
}

/**
 * Micro-entrepreneur declaration and payment periods and due dates.
 * Monthly: last day of the following month. Quarterly: 30 April, 31 July,
 * 31 October, 31 January (last day of the month after the quarter). A due date
 * on a weekend or public holiday moves to the next working day.
 * Source: autoentrepreneur.urssaf.fr, "L'essentiel du statut", échéances.
 */
export function periodesUrssaf(
  year: number,
  periodicite: "mensuelle" | "trimestrielle",
): Periode[] {
  const step = periodicite === "mensuelle" ? 1 : 3;
  const periodes: Periode[] = [];
  for (let first = 1; first <= 12; first += step) {
    const last = first + step - 1;
    const dueYear = last === 12 ? year + 1 : year;
    const dueMonth = last === 12 ? 1 : last + 1;
    periodes.push({
      start: monthStart(year, first),
      end: monthEnd(year, last),
      dueOn: nextJourOuvre(monthEnd(dueYear, dueMonth)),
    });
  }
  return periodes;
}
