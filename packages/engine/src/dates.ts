import type { IsoDate } from "@fc/shared";

const pad = (n: number) => String(n).padStart(2, "0");

export function monthStart(year: number, month: number): IsoDate {
  return `${String(year)}-${pad(month)}-01`;
}

export function monthEnd(year: number, month: number): IsoDate {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year)}-${pad(month)}-${pad(days)}`;
}

export function parseIso(date: IsoDate): { year: number; month: number; day: number } {
  const [y, m, d] = date.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) throw new Error(`Bad date ${date}`);
  return { year: y, month: m, day: d };
}
