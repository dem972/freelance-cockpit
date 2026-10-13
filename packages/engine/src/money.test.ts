import { describe, expect, it } from "vitest";
import type { Cents } from "@fc/shared";
import { applyRate, eurosToCents } from "./money.js";

describe("applyRate", () => {
  it("rounds half away from zero", () => {
    expect(applyRate(5 as Cents, 0.5)).toBe(3);
    expect(applyRate(-5 as Cents, 0.5)).toBe(-3);
  });

  it("returns integers", () => {
    expect(Number.isInteger(applyRate(12345 as Cents, 0.231))).toBe(true);
  });
});

describe("eurosToCents", () => {
  it("handles float noise", () => {
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
    expect(eurosToCents(-19.99)).toBe(-1999);
  });
});
