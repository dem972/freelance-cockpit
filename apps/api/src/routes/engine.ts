import { Hono } from "hono";
import { z } from "zod";
import { monthsFromTjm } from "@fc/engine";
import { compareStatuts } from "@fc/engine/societe";
import { getRateTable } from "@fc/engine";
import { DEFAULT_SETTINGS, Settings, type Cents } from "@fc/shared";
import { parse, yearParam } from "../http.js";

const SimulateInput = z.object({
  year: z.number().int().default(2026),
  /** Euros HT per day. */
  tjm: z.number().min(0).max(100_000),
  /** One value for every month, or 12 values. */
  joursParMois: z.union([z.number().min(0).max(31), z.array(z.number().min(0).max(31)).length(12)]),
  /** Euros HT per month. */
  fraisMensuels: z.number().min(0).max(1_000_000).default(0),
  settings: Settings.partial().default({}),
});

/** The engine as a service: used by the agents (never compute amounts elsewhere). */
export function engineRoutes() {
  const app = new Hono();

  app.post("/simulate", async (c) => {
    const input = parse(SimulateInput, await c.req.json());
    const settings = Settings.parse({ ...DEFAULT_SETTINGS, ...input.settings });
    const results = compareStatuts({
      year: input.year,
      months: monthsFromTjm({
        tjm: Math.round(input.tjm * 100) as Cents,
        joursParMois: input.joursParMois,
        fraisProMensuels: Math.round(input.fraisMensuels * 100) as Cents,
      }),
      timeline: [{ validFrom: `${String(input.year)}-01-01`, settings }],
    });
    return c.json(results);
  });

  app.get("/rates", (c) => {
    const year = yearParam(c.req.query("year"), 2026);
    try {
      return c.json(getRateTable(year));
    } catch {
      return c.json({ error: "no rate table for this year" }, 404);
    }
  });

  return app;
}
