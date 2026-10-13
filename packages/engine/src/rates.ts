import { RateTable } from "@fc/shared";
import rates2026 from "../rates/2026.json" with { type: "json" };

const tables: Record<number, unknown> = { 2026: rates2026 };

/** Returns the validated rate table for a year, or throws if none exists. */
export function getRateTable(year: number): RateTable {
  const raw = tables[year];
  if (raw === undefined) throw new Error(`No rate table for year ${String(year)}`);
  return RateTable.parse(raw);
}
