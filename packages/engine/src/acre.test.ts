import { describe, expect, it } from "vitest";
import { acreActiveInMonth, acreEndDate } from "./acre.js";

describe("acreEndDate (examples from autoentrepreneur.urssaf.fr)", () => {
  it("création le 20/02/2023 → 31/12/2023", () => {
    expect(acreEndDate("2023-02-20")).toBe("2023-12-31");
  });
  it("création le 03/04/2023 → 31/03/2024", () => {
    expect(acreEndDate("2023-04-03")).toBe("2024-03-31");
  });
  it("création en fin d'année → 3e trimestre suivant", () => {
    expect(acreEndDate("2026-12-31")).toBe("2027-09-30");
    expect(acreEndDate("2026-07-01")).toBe("2027-06-30");
  });
});

describe("acreActiveInMonth", () => {
  it("covers the start month through the end month only", () => {
    expect(acreActiveInMonth("2026-03-15", 2026, 2)).toBe(false);
    expect(acreActiveInMonth("2026-03-15", 2026, 3)).toBe(true);
    expect(acreActiveInMonth("2026-03-15", 2026, 12)).toBe(true);
    expect(acreActiveInMonth("2026-03-15", 2027, 1)).toBe(false);
  });
});
