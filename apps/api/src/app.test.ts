import { describe, expect, it } from "vitest";
import { HealthResponse } from "@fc/shared";
import { createApp } from "./app.js";

describe("GET /api/health", () => {
  it("returns ok when the db is up", async () => {
    const res = await createApp({ pingDb: () => Promise.resolve(true) }).request("/api/health");
    expect(res.status).toBe(200);
    expect(HealthResponse.parse(await res.json())).toEqual({ status: "ok", db: "up" });
  });

  it("returns 503 when the db is down", async () => {
    const res = await createApp({ pingDb: () => Promise.resolve(false) }).request("/api/health");
    expect(res.status).toBe(503);
  });
});
