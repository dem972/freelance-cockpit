import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { computeAlerts, computePlan, type CockpitData } from "@fc/engine/cockpit";
import type { Cents, IsoDate } from "@fc/shared";
import type { Db } from "../db.js";
import { alertDismissals } from "../db/schema.js";
import { yearParam } from "../http.js";
import { computeYear, loadProjection, loadTimeline } from "../services/ledger.js";

interface CoverageRow {
  snapshot_date: string | null;
  balance: string;
  provisions_unpaid: string;
  available: string;
  coverage_ratio: number | null;
  next_kind: string | null;
  next_label: string | null;
  next_due_on: string | null;
  next_amount: string | null;
}

interface DeadlineRow {
  id: number;
  kind: string;
  label: string;
  due_on: string;
  amount_due: string;
  paid_on: string | null;
}

/** Raw query rows: postgres-js returns an array, PGlite a `{ rows }` object. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows: T[] }).rows;
}

/** Everything the cockpit shows, for a year, as of a date. */
export async function buildCockpitData(db: Db, year: number, asOf: IsoDate): Promise<CockpitData> {
  const [computation, timeline, projection, coverage, deadlines] = await Promise.all([
    computeYear(db, year, asOf),
    loadTimeline(db),
    loadProjection(db, year),
    db.execute(sql`
        select b.snapshot_date, b.balance, b.provisions_unpaid, b.available,
               c.coverage_ratio, c.next_kind, c.next_label, c.next_due_on, c.next_amount
        from v_available_balance b cross join v_coverage c`),
    db.execute(sql`
        select id, kind, label, due_on, amount_due, paid_on from deadlines
        where due_on >= ${`${String(year)}-01-01`} and period_start <= ${`${String(year)}-12-31`}
        order by due_on, id`),
  ]);
  const row = rowsOf<CoverageRow>(coverage)[0];
  const cents = (v: string | null | undefined) => Number(v ?? 0) as Cents;
  const data: CockpitData = {
    year,
    asOf,
    balance: {
      snapshotDate: row?.snapshot_date ?? null,
      balance: cents(row?.balance),
      provisionsUnpaid: cents(row?.provisions_unpaid),
      available: cents(row?.available),
    },
    coverage: {
      ratio: row?.coverage_ratio ?? null,
      next:
        row?.next_label == null || row.next_due_on === null
          ? null
          : {
              label: row.next_label,
              kind: row.next_kind ?? "autre",
              dueOn: row.next_due_on,
              amount: cents(row.next_amount),
            },
    },
    realised: computation.realised,
    projected: computation.projected,
    plan: computePlan(year, projection, timeline),
    deadlines: rowsOf<DeadlineRow>(deadlines).map((d) => ({
      id: d.id,
      kind: d.kind,
      label: d.label,
      dueOn: d.due_on,
      amountDue: cents(d.amount_due),
      paidOn: d.paid_on,
    })),
  };
  return data;
}

export function cockpitRoutes({ db, today }: { db: Db; today: () => IsoDate }) {
  const app = new Hono();

  app.get("/cockpit", async (c) => {
    const asOf = today();
    const year = yearParam(c.req.query("year"), Number(asOf.slice(0, 4)));
    return c.json(await buildCockpitData(db, year, asOf));
  });

  app.get("/alerts", async (c) => {
    const asOf = today();
    const year = yearParam(c.req.query("year"), Number(asOf.slice(0, 4)));
    const [data, dismissed] = await Promise.all([
      buildCockpitData(db, year, asOf),
      db.select().from(alertDismissals),
    ]);
    const hidden = new Set(dismissed.map((d) => d.key));
    return c.json(computeAlerts(data).filter((a) => !hidden.has(a.key)));
  });

  app.post("/alerts/:key/dismiss", async (c) => {
    const key = c.req.param("key");
    if (key.length === 0 || key.length > 200) return c.json({ error: "invalid key" }, 400);
    await db.insert(alertDismissals).values({ key }).onConflictDoNothing();
    return c.body(null, 204);
  });

  return app;
}
