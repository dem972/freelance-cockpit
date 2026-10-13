import { z } from "zod";

/** Amount in euro cents. Always an integer, never a float. */
export const Cents = z.number().int().brand<"Cents">();
export type Cents = z.infer<typeof Cents>;
