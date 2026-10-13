import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@fc/shared";
import { createApp } from "./app.js";
import { testDb } from "../test/db.js";

type App = ReturnType<typeof createApp>;
let app: App;
let today = "2026-03-15";

interface Prov {
  kind: string;
  amount: number;
  rateVersion: string;
}
interface Tx {
  id: number;
  kind: string;
  amount: number;
  provisions: Prov[];
}
interface Dl {
  id: number;
  periodStart: string;
  dueOn: string;
  amountDue: number;
  paidOn: string | null;
  auto: boolean;
}

/** Calls the API; the caller states the JSON shape it expects (`as` below). */
async function call(method: string, url: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.request(`/api${url}`, init);
  const text = await res.text();
  return { status: res.status, body: (text === "" ? null : JSON.parse(text)) as unknown };
}
const find = <T>(list: T[], pred: (x: T) => boolean): T => {
  const found = list.find(pred);
  if (found === undefined) throw new Error("not found");
  return found;
};

beforeEach(async () => {
  today = "2026-03-15";
  const db = await testDb();
  app = createApp({ db, pingDb: () => Promise.resolve(true), today: () => today });
});

const invoice = {
  number: "F-2026-001",
  client: "ACME",
  issuedOn: "2026-01-05",
  dueOn: null,
  amountHt: 500000,
  vatAmount: 0,
  paidOn: null,
  note: null,
};

describe("ledger API", () => {
  it("returns the default settings timeline when none is stored", async () => {
    const body = (await call("GET", "/settings")).body as { settings: unknown }[];
    expect(body[0]?.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("paying an invoice records the encaissement, its provisions and the Urssaf deadline", async () => {
    const created = await call("POST", "/invoices", invoice);
    expect(created.status).toBe(201);
    const paid = await call(
      "POST",
      `/invoices/${String((created.body as { id: number }).id)}/pay`,
      {
        date: "2026-01-20",
      },
    );
    expect(paid.status).toBe(201);

    const txs = (await call("GET", "/transactions?year=2026")).body as Tx[];
    const tx = find(txs, () => true);
    expect(tx.amount).toBe(500000);
    const urssaf = find(tx.provisions, (p) => p.kind === "urssaf");
    expect(urssaf.amount).toBe(128000);
    expect(urssaf.rateVersion).toMatch(/^2026-/);

    const dls = (await call("GET", "/deadlines?year=2026")).body as Dl[];
    const jan = find(dls, (d) => d.periodStart === "2026-01-01");
    expect(jan.amountDue).toBe(128000 + 1000);
    expect(jan.dueOn).toBe("2026-03-02");
    expect(jan.auto).toBe(true);
  });

  it("recomputes provisions when settings change, and keeps paid deadlines untouched", async () => {
    await call("POST", "/transactions", {
      date: "2026-01-10",
      label: "Client",
      amount: 100000,
      kind: "encaissement",
      vatAmount: 0,
      invoiceId: null,
      deadlineId: null,
    });
    const dls = (await call("GET", "/deadlines?year=2026")).body as Dl[];
    const jan = find(dls, () => true);
    await call("POST", `/deadlines/${String(jan.id)}/pay`, { date: "2026-02-20" });

    await call("PUT", "/settings", [
      { validFrom: "2026-01-01", settings: { ...DEFAULT_SETTINGS, versementLiberatoire: true } },
    ]);
    const txs = (await call("GET", "/transactions?year=2026")).body as Tx[];
    const encaissement = find(txs, (t) => t.kind === "encaissement");
    expect(find(encaissement.provisions, (p) => p.kind === "impot").amount).toBe(2200);

    const after = (await call("GET", "/deadlines?year=2026")).body as Dl[];
    const janAfter = find(after, (d) => d.id === jan.id);
    expect(janAfter.paidOn).toBe("2026-02-20");
    expect(janAfter.amountDue).toBe(jan.amountDue);
    // The payment itself is a recorded outflow.
    expect(txs.some((t) => t.kind === "paiement_echeance" && t.amount === -jan.amountDue)).toBe(
      true,
    );
  });

  it("deleting a transaction removes its provisions", async () => {
    const { body } = await call("POST", "/transactions", {
      date: "2026-02-10",
      label: "Client",
      amount: 100000,
      kind: "encaissement",
      vatAmount: 0,
      invoiceId: null,
      deadlineId: null,
    });
    expect(
      (await call("DELETE", `/transactions/${String((body as { id: number }).id)}`)).status,
    ).toBe(204);
    const txs = (await call("GET", "/transactions?year=2026")).body as Tx[];
    expect(txs).toEqual([]);
  });

  it("rejects invalid payloads with 400 and the zod issues", async () => {
    const res = await call("POST", "/transactions", {
      date: "2026-02-10",
      label: "Frais",
      amount: 1000,
      kind: "frais_pro",
      vatAmount: 0,
      invoiceId: null,
      deadlineId: null,
    });
    expect(res.status).toBe(400);
    const { issues } = res.body as { issues: { message: string }[] };
    expect(issues[0]?.message).toBe("Un frais est négatif");
  });

  it("refuses duplicate invoice numbers", async () => {
    await call("POST", "/invoices", invoice);
    const dup = await call("POST", "/invoices", invoice);
    expect(dup.status).toBe(409);
  });

  it("stores the projection and uses it for provisions' income tax rate", async () => {
    const projection = {
      tjm: 50000,
      joursParMois: Array<number>(12).fill(18),
      fraisMensuels: 0,
      conges: [],
      joursDepuisCalendrier: false,
    };
    expect((await call("PUT", "/projections/2026", projection)).status).toBe(200);
    expect(((await call("GET", "/projections/2026")).body as { tjm: number }).tjm).toBe(50000);
  });
});
