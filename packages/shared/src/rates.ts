import { z } from "zod";

/**
 * A single sourced rate or threshold. Every fiscal value used by the engine
 * must carry its official source and the date it was last checked.
 * `unit`: "rate" is a fraction (0.256 = 25,6 %), "eur" is whole euros, "date" an ISO date.
 */
export const SourcedValue = z
  .discriminatedUnion("unit", [
    z.object({ unit: z.enum(["rate", "eur"]), value: z.number() }),
    z.object({ unit: z.literal("date"), value: z.iso.date() }),
  ])
  .and(
    z.object({
      source_url: z.url(),
      verified_on: z.iso.date(),
      note: z.string().optional(),
    }),
  );
export type SourcedValue = z.infer<typeof SourcedValue>;

export const RateTable = z.object({
  year: z.number().int().min(2000).max(2100),
  rates: z.record(z.string(), SourcedValue),
});
export type RateTable = z.infer<typeof RateTable>;

/** A rate as used in a computation, so the UI can show where it came from. */
export interface UsedRate {
  key: string;
  year: number;
  value: number | string;
  unit: SourcedValue["unit"];
  source_url: string;
  verified_on: string;
  note?: string | undefined;
  flag?: "unverified" | "conflict" | undefined;
}
