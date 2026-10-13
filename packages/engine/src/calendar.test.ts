import { describe, expect, it } from "vitest";
import { joursFeries, joursOuvres, nextJourOuvre } from "./calendar.js";
import { periodesUrssaf } from "./echeances.js";

describe("joursFeries", () => {
  it("2026: Pâques le 5 avril", () => {
    expect(joursFeries(2026)).toEqual([
      "2026-01-01",
      "2026-04-06",
      "2026-05-01",
      "2026-05-08",
      "2026-05-14",
      "2026-05-25",
      "2026-07-14",
      "2026-08-15",
      "2026-11-01",
      "2026-11-11",
      "2026-12-25",
    ]);
  });
});

describe("joursOuvres", () => {
  it("mai 2026 : 21 jours de semaine moins 4 fériés en semaine", () => {
    expect(joursOuvres(2026, 5)).toHaveLength(17);
  });
});

describe("échéances Urssaf", () => {
  it("exemple Urssaf : mars 2023 exigible le 30 avril (dimanche), 1er mai férié → 2 mai", () => {
    const mars = periodesUrssaf(2023, "mensuelle")[2];
    expect(mars?.dueOn).toBe("2023-05-02");
    expect(nextJourOuvre("2023-04-30")).toBe("2023-05-02");
  });

  it("trimestrielle 2026 : 30/04, 31/07, 02/11 (31/10 samedi), 01/02/2027 (31/01 dimanche)", () => {
    expect(periodesUrssaf(2026, "trimestrielle").map((p) => p.dueOn)).toEqual([
      "2026-04-30",
      "2026-07-31",
      "2026-11-02",
      "2027-02-01",
    ]);
  });

  it("mensuelle : décembre exigible fin janvier suivant", () => {
    const p = periodesUrssaf(2026, "mensuelle");
    expect(p).toHaveLength(12);
    expect(p[11]?.start).toBe("2026-12-01");
    expect(p[11]?.dueOn).toBe("2027-02-01");
  });
});
