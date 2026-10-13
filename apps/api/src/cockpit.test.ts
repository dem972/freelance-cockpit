import { beforeEach, describe, expect, it } from "vitest";
import type { CockpitData } from "@fc/engine/cockpit";
import { createApp } from "./app.js";
import { testDb } from "../test/db.js";

let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.request(`/api${url}`, init);
  return { status: res.status, body: await res.json() };
}

const encaissement = (date: string, amount: number) => ({
  date,
  label: "Client",
  amount,
  kind: "encaissement",
  vatAmount: 0,
  invoiceId: null,
  deadlineId: null,
});

beforeEach(async () => {
  app = createApp({
    db: await testDb(),
    pingDb: () => Promise.resolve(true),
    today: () => "2026-03-15",
  });
});

describe("GET /api/cockpit", () => {
  it("available = balance − unpaid provisions; coverage points at the next deadline", async () => {
    await call("PUT", "/balance", { date: "2025-12-31", amount: 1_000_000 });
    await call("POST", "/transactions", encaissement("2026-01-10", 500_000));
    await call("POST", "/transactions", encaissement("2026-02-10", 500_000));

    const data = (await call("GET", "/cockpit?year=2026")).body as CockpitData;
    expect(data.balance.balance).toBe(2_000_000);
    const unpaid = data.balance.provisionsUnpaid;
    // 2 × (25,6 % + 0,2 %) + income tax provisions.
    expect(unpaid).toBeGreaterThanOrEqual(2 * 129_000);
    expect(data.balance.available).toBe(2_000_000 - unpaid);
    expect(data.coverage.ratio).toBeCloseTo(2_000_000 / unpaid, 5);
    expect(data.coverage.next?.dueOn).toBe("2026-03-02");
    expect(data.coverage.next?.amount).toBe(129_000);
    expect(data.realised.ca).toBe(1_000_000);
  });

  it("paying a deadline lowers unpaid provisions and the balance by the same amount", async () => {
    await call("PUT", "/balance", { date: "2025-12-31", amount: 1_000_000 });
    await call("POST", "/transactions", encaissement("2026-01-10", 500_000));
    const before = (await call("GET", "/cockpit")).body as CockpitData;
    const jan = before.deadlines.find((d) => d.dueOn === "2026-03-02");
    await call("POST", `/deadlines/${String(jan?.id)}/pay`, { date: "2026-02-25" });
    const after = (await call("GET", "/cockpit")).body as CockpitData;
    expect(after.balance.balance).toBe(before.balance.balance - 129_000);
    expect(after.balance.provisionsUnpaid).toBe(before.balance.provisionsUnpaid - 129_000);
    expect(after.balance.available).toBe(before.balance.available);
  });

  it("projected = realised months + projection; plan = projection only", async () => {
    await call("PUT", "/projections/2026", {
      tjm: 50_000,
      joursParMois: Array<number>(12).fill(10),
      fraisMensuels: 0,
      conges: [],
      joursDepuisCalendrier: false,
    });
    await call("POST", "/transactions", encaissement("2026-01-10", 300_000));
    const data = (await call("GET", "/cockpit")).body as CockpitData;
    expect(data.plan.ca).toBe(12 * 500_000);
    // Jan–Mar realised (3 000 € then 0 + 0), Apr–Dec projected.
    expect(data.projected.ca).toBe(300_000 + 9 * 500_000);
  });

  it("works with no data at all", async () => {
    const res = await call("GET", "/cockpit");
    expect(res.status).toBe(200);
    expect((res.body as CockpitData).coverage.ratio).toBeNull();
  });
});

describe("alerts", () => {
  it("lists a late deadline and hides it once dismissed", async () => {
    await call("POST", "/transactions", encaissement("2026-01-10", 500_000));
    const alerts = (await call("GET", "/alerts")).body as { key: string; severity: string }[];
    const late = alerts.find((a) => a.key.startsWith("deadline-late-"));
    expect(late?.severity).toBe("critical");
    const res = await app.request(`/api/alerts/${String(late?.key)}/dismiss`, { method: "POST" });
    expect(res.status).toBe(204);
    const after = (await call("GET", "/alerts")).body as { key: string }[];
    expect(after.some((a) => a.key === late?.key)).toBe(false);
  });
});

describe("GET /api/optimize", () => {
  // ~30 engine runs (one per lever): slow on shared CI runners.
  it("ranks options on the real year", async () => {
    await call("PUT", "/projections/2026", {
      tjm: 50_000,
      joursParMois: Array<number>(12).fill(15),
      fraisMensuels: 15_000,
      conges: [],
      joursDepuisCalendrier: false,
    });
    const body = (await call("GET", "/optimize?year=2026")).body as {
      baseline: { statut: string };
      options: { gain: number }[];
    };
    expect(body.baseline.statut).toBe("micro_bnc");
    expect(body.options.length).toBeGreaterThan(4);
  }, 60_000);
});
