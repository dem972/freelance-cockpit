import type { Cents } from "@fc/shared";

/**
 * Multiplies an amount in cents by a rate and rounds half away from zero
 * to the nearest cent. This is the only rounding rule used by the engine
 * unless a specific rule (documented next to its use) says otherwise.
 */
export function applyRate(amount: Cents, rate: number): Cents {
  const raw = amount * rate;
  return (Math.sign(raw) * Math.round(Math.abs(raw))) as Cents;
}

export function eurosToCents(euros: number): Cents {
  return (Math.sign(euros) * Math.round(Math.abs(euros) * 100)) as Cents;
}
