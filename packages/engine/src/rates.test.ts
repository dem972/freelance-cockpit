import { describe, expect, it } from "vitest";
import { getRateTable } from "./rates.js";

describe("getRateTable", () => {
  it("loads and validates 2026", () => {
    expect(getRateTable(2026).year).toBe(2026);
  });

  it("throws for an unknown year", () => {
    expect(() => getRateTable(1999)).toThrow();
  });
});
