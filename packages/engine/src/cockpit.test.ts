import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Cents, type Projection, type Settings } from "@fc/shared";
import { computeCockpit, rateVersion, type LedgerTransaction } from "./cockpit.js";
import { joursPrevus } from "./conges.js";

const eur = (n: number) => (n * 100) as Cents;
const timeline = (s: Partial<Settings> = {}) => [
  { validFrom: "2026-01-01", settings: { ...DEFAULT_SETTINGS, ...s } },
];
const projection: Projection = {
  year: 2026,
  tjm: eur(500),
  joursParMois: Array<number>(12).fill(10),
  fraisMensuels: eur(0),
  conges: [],
  joursDepuisCalendrier: false,
};
const tx = (
  id: number,
  date: string,
  amount: number,
  kind: LedgerTransaction["kind"],
  vat = 0,
) => ({
  id,
  date,
  amount: eur(amount),
  kind,
  vatAmount: eur(vat),
});

describe("computeCockpit", () => {
  it("provisions an encaissement at 25,6 % + 0,2 % CFP + projected income tax rate", () => {
    const r = computeCockpit({
      year: 2026,
      asOf: "2026-03-31",
      transactions: [tx(1, "2026-02-10", 5_000, "encaissement")],
      projection,
      timeline: timeline(),
    });
    const by = Object.fromEntries(r.provisions.map((p) => [p.kind, p.amount]));
    expect(by.urssaf).toBe(eur(1_280));
    expect(by.cfp).toBe(eur(10));
    expect(by.impot).toBeGreaterThan(0);
    expect(by.tva).toBeUndefined();
  });

  it("uses realised months up to asOf and the projection afterwards", () => {
    const r = computeCockpit({
      year: 2026,
      asOf: "2026-03-31",
      transactions: [tx(1, "2026-02-10", 5_000, "encaissement")],
      projection,
      timeline: timeline(),
    });
    expect(r.realised.ca).toBe(eur(5_000));
    expect(r.projected.ca).toBe(eur(5_000 + 9 * 5_000));
  });

  it("VFL: impôt provisioned at 2,2 % and included in the Urssaf deadline", () => {
    const r = computeCockpit({
      year: 2026,
      asOf: "2026-01-31",
      transactions: [tx(1, "2026-01-15", 1_000, "encaissement")],
      projection: null,
      timeline: timeline({ versementLiberatoire: true }),
    });
    const jan = r.urssafDeadlines[0];
    expect(jan?.amountDue).toBe(eur(256 + 2 + 22));
    expect(jan?.dueOn).toBe("2026-03-02");
  });

  it("TVA: collected on encaissements, recovered on frais when assujetti", () => {
    const r = computeCockpit({
      year: 2026,
      asOf: "2026-12-31",
      transactions: [
        tx(1, "2026-01-15", 1_200, "encaissement", 200),
        tx(2, "2026-01-20", -120, "frais_pro", 20),
      ],
      projection: null,
      timeline: timeline({ tva: "assujetti" }),
    });
    const tva = r.provisions.filter((p) => p.kind === "tva").map((p) => p.amount);
    expect(tva).toEqual([eur(200), eur(-20)]);
    // Cotisations on HT only.
    expect(r.provisions.find((p) => p.kind === "urssaf")?.amount).toBe(eur(256));
  });

  it("is deterministic and versioned", () => {
    const input = {
      year: 2026,
      asOf: "2026-06-30",
      transactions: [tx(1, "2026-05-01", 3_000, "encaissement")],
      projection,
      timeline: timeline(),
    };
    expect(computeCockpit(input)).toEqual(computeCockpit(input));
    expect(rateVersion(2026)).toMatch(/^2026-[0-9a-f]{8}-ms/);
  });
});

describe("joursPrevus", () => {
  it("calendar mode: working days minus days off on working days", () => {
    const jours = joursPrevus({
      ...projection,
      joursDepuisCalendrier: true,
      conges: ["2026-05-04", "2026-05-05", "2026-05-09" /* samedi */, "2026-05-14" /* férié */],
    });
    expect(jours[4]).toBe(17 - 2);
  });
});
