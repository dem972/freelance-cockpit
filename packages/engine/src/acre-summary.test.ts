import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Cents, type Settings } from "@fc/shared";
import { acreEndDate12Mois } from "./acre.js";
import { computeMicroBnc } from "./micro.js";
import { monthsFromTjm } from "./simulate.js";
import { computeSociete } from "./societe.js";

const eur = (n: number) => (n * 100) as Cents;
const input = (caMensuel: number, s: Partial<Settings>) => ({
  year: 2026,
  months: monthsFromTjm({ tjm: eur(caMensuel), joursParMois: 1, fraisProMensuels: eur(0) }),
  timeline: [{ validFrom: "2026-01-01", settings: { ...DEFAULT_SETTINGS, ...s } }],
});

describe("Acre summary", () => {
  it("micro: ends 31/12/2026 for a start on 15/03/2026, saves (25,6 − 12,8) % on Mar–Dec", () => {
    const r = computeMicroBnc(input(2_000, { acreDebutActivite: "2026-03-15" }));
    expect(r.acre?.fin).toBe("2026-12-31");
    expect(r.acre?.moisEpuisement).toBe("2026-12");
    expect(r.acre?.economie).toBe(eur(10 * 2_000 * 0.128));
    expect(r.warnings.map((w) => w.code)).toContain("acre_fin");
  });

  it("micro: no summary without Acre", () => {
    expect(computeMicroBnc(input(2_000, {})).acre).toBeUndefined();
  });

  it("12-month end date", () => {
    expect(acreEndDate12Mois("2026-03-01")).toBe("2027-02-28");
    expect(acreEndDate12Mois("2026-01-01")).toBe("2026-12-31");
  });

  it("EURL IR: Acre saves contributions on a low income, none on a high one", () => {
    const low = computeSociete(input(2_000, { acreDebutActivite: "2026-01-01" }), "eurl_ir");
    expect(low.acre?.economie).toBeGreaterThan(0);
    const high = computeSociete(input(15_000, { acreDebutActivite: "2026-01-01" }), "eurl_ir");
    expect(high.acre?.economie).toBe(0);
  });

  it("portage never gets Acre", () => {
    const r = computeSociete(input(5_000, { acreDebutActivite: "2026-01-01" }), "portage");
    expect(r.acre).toBeUndefined();
  });
});
