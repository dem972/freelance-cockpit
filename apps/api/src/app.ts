import { Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { HealthResponse, IsoDate } from "@fc/shared";
import type { Db } from "./db.js";
import { cockpitRoutes } from "./routes/cockpit.js";
import { ledgerRoutes } from "./routes/ledger.js";

export interface AppDeps {
  pingDb: () => Promise<boolean>;
  /** Auth for every route except /api/health. Absent = no auth (tests, AUTH_MODE=none). */
  auth?: MiddlewareHandler;
  /** Absent in health-only tests. */
  db?: Db;
  today?: () => IsoDate;
}

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (pgCode(err) === "23505") return c.json({ error: "conflict" }, 409);
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });

  app.get("/health", async (c) => {
    const up = await deps.pingDb();
    const body: HealthResponse = { status: up ? "ok" : "degraded", db: up ? "up" : "down" };
    return c.json(body, up ? 200 : 503);
  });

  // Registered after /health, so the healthcheck stays open (it exposes no
  // data) and every route below requires authentication.
  if (deps.auth !== undefined) app.use("*", deps.auth);

  if (deps.db !== undefined) {
    const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
    app.route("/", ledgerRoutes({ db: deps.db, today }));
    app.route("/", cockpitRoutes({ db: deps.db, today }));
  }

  return app;
}

/** Postgres error code, possibly wrapped by Drizzle in `cause`. */
function pgCode(err: unknown): string | undefined {
  for (
    let e: unknown = err;
    typeof e === "object" && e !== null;
    e = (e as { cause?: unknown }).cause
  ) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
