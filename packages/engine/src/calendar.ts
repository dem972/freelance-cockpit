import type { IsoDate } from "@fc/shared";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) =>
  `${String(d.getUTCFullYear())}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Easter Sunday (Meeus/Jones/Butcher, Gregorian calendar). */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/**
 * The 11 public holidays of metropolitan France (Code du travail, art. L3133-1).
 * Alsace-Moselle extra days are not included.
 */
export function joursFeries(year: number): IsoDate[] {
  const p = easter(year);
  return [
    utc(year, 1, 1),
    addDays(p, 1), // lundi de Pâques
    utc(year, 5, 1),
    utc(year, 5, 8),
    addDays(p, 39), // Ascension
    addDays(p, 50), // lundi de Pentecôte
    utc(year, 7, 14),
    utc(year, 8, 15),
    utc(year, 11, 1),
    utc(year, 11, 11),
    utc(year, 12, 25),
  ]
    .map(iso)
    .sort();
}

export function isWeekend(date: IsoDate): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function isJourOuvre(date: IsoDate): boolean {
  return !isWeekend(date) && !joursFeries(Number(date.slice(0, 4))).includes(date);
}

/** Moves a date forward to the next working day if it is a weekend or holiday. */
export function nextJourOuvre(date: IsoDate): IsoDate {
  let d = new Date(`${date}T00:00:00Z`);
  while (!isJourOuvre(iso(d))) d = addDays(d, 1);
  return iso(d);
}

/** Working days (Mon–Fri, excluding public holidays) of a month, as ISO dates. */
export function joursOuvres(year: number, month: number): IsoDate[] {
  const days: IsoDate[] = [];
  for (let d = utc(year, month, 1); d.getUTCMonth() === month - 1; d = addDays(d, 1)) {
    if (isJourOuvre(iso(d))) days.push(iso(d));
  }
  return days;
}
