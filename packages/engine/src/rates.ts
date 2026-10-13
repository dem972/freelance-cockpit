import { RateTable, type Cents, type UsedRate } from "@fc/shared";
import rates2026 from "../rates/2026.json" with { type: "json" };
import { eurosToCents } from "./money.js";

const tables: Record<number, unknown> = { 2026: rates2026 };

export const AVAILABLE_YEARS = Object.keys(tables).map(Number);

/** Returns the validated rate table for a year, or throws if none exists. */
export function getRateTable(year: number): RateTable {
  const raw = tables[year];
  if (raw === undefined) throw new Error(`No rate table for year ${String(year)}`);
  return RateTable.parse(raw);
}

/**
 * Rate accessor that records every value read, so each result can list the
 * exact sourced rates it relied on.
 */
export class Rates {
  readonly year: number;
  private readonly table: RateTable;
  private readonly used = new Map<string, UsedRate>();

  constructor(year: number) {
    this.year = year;
    this.table = getRateTable(year);
  }

  private get(key: string, unit: "rate" | "eur" | "date") {
    const entry = this.table.rates[key];
    if (entry === undefined) throw new Error(`Missing rate ${key} for ${String(this.year)}`);
    if (entry.unit !== unit) throw new Error(`Rate ${key} is ${entry.unit}, expected ${unit}`);
    this.used.set(key, { key, year: this.year, ...entry });
    return entry.value;
  }

  rate(key: string): number {
    return this.get(key, "rate") as number;
  }

  cents(key: string): Cents {
    return eurosToCents(this.get(key, "eur") as number);
  }

  date(key: string): string {
    return this.get(key, "date") as string;
  }

  usedRates(): UsedRate[] {
    return [...this.used.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
}
