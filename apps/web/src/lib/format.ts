const eurFmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const eurFmtCents = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const pctFmt = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });

/** Cents → "12 345 €". */
export const eur = (cents: number) => eurFmt.format(cents / 100);
export const eurPrecise = (cents: number) => eurFmtCents.format(cents / 100);
export const pct = (rate: number) => pctFmt.format(rate);
export const date = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

export const MONTHS = [
  "Janv.",
  "Févr.",
  "Mars",
  "Avr.",
  "Mai",
  "Juin",
  "Juil.",
  "Août",
  "Sept.",
  "Oct.",
  "Nov.",
  "Déc.",
];

/** Euros typed by the user (accepts "1 234,5") → cents. */
export function parseEuros(input: string): number {
  const n = Number(input.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
