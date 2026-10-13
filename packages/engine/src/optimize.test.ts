import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Cents, type Settings } from "@fc/shared";
import { optimize } from "./optimize.js";
import { monthsFromTjm } from "./simulate.js";
import { computeStatut } from "./societe.js";

const eur = (n: number) => (n * 100) as Cents;
const input = (caMensuel: number, s: Partial<Settings> = {}) => ({
  year: 2026,
  months: monthsFromTjm({ tjm: eur(caMensuel), joursParMois: 1, fraisProMensuels: eur(150) }),
  timeline: [{ validFrom: "2026-01-01", settings: { ...DEFAULT_SETTINGS, ...s } }],
});

describe("optimize", () => {
  const result = optimize(input(9_000));

  it("baseline is the current statut, recomputed by the engine", () => {
    expect(result.baseline.statut).toBe("micro_bnc");
    expect(result.baseline.net).toBe(computeStatut(input(9_000), "micro_bnc").net);
    expect(result.baseline.gain).toBe(0);
  });

  it("gains are net − baseline and options are sorted best first", () => {
    for (const o of result.options) expect(o.gain).toBe(o.net - result.baseline.net);
    const gains = result.options.map((o) => o.gain);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
  });

  it("explores the pay share for EURL IS and SASU and keeps the best", () => {
    for (const statut of ["eurl_is", "sasu"] as const) {
      const curve = result.remunerationCurves[statut];
      expect(curve).toHaveLength(11);
      const best = Math.max(...curve.map((p) => p.net));
      const option = result.options.find((o) => o.id.startsWith(`${statut}-part-`));
      expect(option?.net).toBe(best);
    }
  });

  it("offers the VFL switch in micro, not elsewhere", () => {
    expect(result.options.some((o) => o.id === "vl-true")).toBe(true);
    const sasu = optimize(input(9_000, { statut: "sasu" }));
    expect(sasu.options.some((o) => o.id.startsWith("vl-"))).toBe(false);
  });

  it("never repeats the current situation as an option", () => {
    expect(result.options.some((o) => Object.keys(o.change).length === 0)).toBe(false);
    expect(result.disclaimer).toMatch(/pas un conseil/);
  });
});
