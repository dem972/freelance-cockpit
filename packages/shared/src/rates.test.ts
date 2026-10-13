import { describe, expect, it } from "vitest";
import { RateTable } from "./rates.js";

describe("RateTable", () => {
  it("rejects a rate without source", () => {
    const result = RateTable.safeParse({
      year: 2026,
      rates: { example: { unit: "rate", value: 0.1, verified_on: "2026-01-01" } },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a sourced rate", () => {
    const result = RateTable.safeParse({
      year: 2026,
      rates: {
        example: {
          unit: "rate",
          value: 0.1,
          source_url: "https://www.urssaf.fr/",
          verified_on: "2026-01-01",
        },
      },
    });
    expect(result.success).toBe(true);
  });
});
