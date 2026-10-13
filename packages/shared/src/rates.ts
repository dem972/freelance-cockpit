import { z } from "zod";

/**
 * A single sourced rate or threshold. Every fiscal value used by the engine
 * must carry its official source and the date it was last checked.
 */
export const SourcedValue = z.object({
  value: z.number(),
  source_url: z.url(),
  verified_on: z.iso.date(),
  note: z.string().optional(),
});
export type SourcedValue = z.infer<typeof SourcedValue>;

export const RateTable = z.object({
  year: z.number().int().min(2000).max(2100),
  rates: z.record(z.string(), SourcedValue),
});
export type RateTable = z.infer<typeof RateTable>;
