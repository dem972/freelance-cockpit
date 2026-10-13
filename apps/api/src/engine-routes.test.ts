import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const app = createApp({ pingDb: () => Promise.resolve(true) });

describe("engine routes", () => {
  it("POST /api/simulate compares the five statuts with the same engine", async () => {
    const res = await app.request("/api/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tjm: 500, joursParMois: 18, fraisMensuels: 150 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { statut: string; net: number }[];
    expect(body.map((b) => b.statut)).toEqual([
      "micro_bnc",
      "eurl_ir",
      "eurl_is",
      "sasu",
      "portage",
    ]);
    expect(body[0]?.net).toBe(6384801);
  });

  it("rejects invalid input", async () => {
    const res = await app.request("/api/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tjm: -1, joursParMois: 18 }),
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/rates returns the sourced table", async () => {
    const res = await app.request("/api/rates?year=2026");
    const body = (await res.json()) as { rates: Record<string, { source_url: string }> };
    expect(Object.keys(body.rates).length).toBeGreaterThan(20);
    expect((await app.request("/api/rates?year=2099")).status).toBe(404);
  });
});
