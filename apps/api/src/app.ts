import { Hono } from "hono";
import type { HealthResponse } from "@fc/shared";

export interface AppDeps {
  pingDb: () => Promise<boolean>;
}

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath("/api");

  app.get("/health", async (c) => {
    const up = await deps.pingDb();
    const body: HealthResponse = { status: up ? "ok" : "degraded", db: up ? "up" : "down" };
    return c.json(body, up ? 200 : 503);
  });

  return app;
}
