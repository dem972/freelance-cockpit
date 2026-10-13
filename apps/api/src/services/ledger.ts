import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { computeCockpit, type CockpitComputation, type CockpitInput } from "@fc/engine/cockpit";
import {
  DEFAULT_SETTINGS,
  Projection,
  SettingsPatch,
  type Cents,
  type IsoDate,
  type SettingsTimeline,
} from "@fc/shared";
import type { Db } from "../db.js";
import { deadlines, projections, provisions, settingsPatches, transactions } from "../db/schema.js";

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export async function loadTimeline(db: Db): Promise<SettingsTimeline> {
  const rows = await db.select().from(settingsPatches).orderBy(settingsPatches.validFrom);
  if (rows.length === 0) return [{ validFrom: "2026-01-01", settings: DEFAULT_SETTINGS }];
  const timeline = rows.map((r) =>
    SettingsPatch.parse({ validFrom: r.validFrom, settings: r.patch }),
  );
  // The first patch must be complete: fill it from the defaults if needed.
  const [first, ...rest] = timeline;
  return first === undefined
    ? []
    : [
        { validFrom: first.validFrom, settings: { ...DEFAULT_SETTINGS, ...first.settings } },
        ...rest,
      ];
}

export async function loadProjection(db: Db, year: number): Promise<Projection | null> {
  const [row] = await db.select().from(projections).where(eq(projections.year, year));
  return row === undefined ? null : Projection.parse(row.data);
}

export async function loadTransactions(db: Db, year: number) {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        gte(transactions.date, `${String(year)}-01-01`),
        lte(transactions.date, `${String(year)}-12-31`),
      ),
    )
    .orderBy(transactions.date, transactions.id);
}

/** Everything the engine needs for a year, loaded from the database. */
export async function cockpitInput(db: Db, year: number, asOf: IsoDate): Promise<CockpitInput> {
  const [timeline, projection, txs] = await Promise.all([
    loadTimeline(db),
    loadProjection(db, year),
    loadTransactions(db, year),
  ]);
  return {
    year,
    asOf,
    timeline,
    projection,
    transactions: txs.map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount as Cents,
      kind: t.kind,
      vatAmount: t.vatAmount as Cents,
    })),
  };
}

export async function computeYear(
  db: Db,
  year: number,
  asOf: IsoDate,
): Promise<CockpitComputation> {
  return computeCockpit(await cockpitInput(db, year, asOf));
}

function urssafLabel(start: IsoDate, end: IsoDate): string {
  const year = start.slice(0, 4);
  const m1 = Number(start.slice(5, 7));
  const m2 = Number(end.slice(5, 7));
  return m1 === m2
    ? `Urssaf : ${MONTH_NAMES[m1 - 1] ?? ""} ${year}`
    : `Urssaf : T${String(Math.ceil(m2 / 3))} ${year}`;
}

/**
 * Recomputes every provision of the year and the generated Urssaf deadlines.
 * Deterministic: the same data and rates always give the same rows.
 */
export async function recomputeYear(
  db: Db,
  year: number,
  asOf: IsoDate,
): Promise<CockpitComputation> {
  const result = await computeYear(db, year, asOf);
  await db.transaction(async (tx) => {
    const ids = (await loadTransactions(tx, year)).map((t) => t.id);
    if (ids.length > 0) await tx.delete(provisions).where(inArray(provisions.transactionId, ids));
    if (result.provisions.length > 0) {
      await tx
        .insert(provisions)
        .values(result.provisions.map((p) => ({ ...p, rateVersion: result.rateVersion })));
    }

    const existing = await tx
      .select()
      .from(deadlines)
      .where(
        and(
          eq(deadlines.kind, "urssaf"),
          eq(deadlines.auto, true),
          gte(deadlines.periodStart, `${String(year)}-01-01`),
          lte(deadlines.periodStart, `${String(year)}-12-31`),
        ),
      );
    const keep = new Set<number>();
    for (const d of result.urssafDeadlines) {
      const match = existing.find(
        (e) => e.periodStart === d.periodStart && e.periodEnd === d.periodEnd,
      );
      if (match === undefined) {
        await tx.insert(deadlines).values({
          kind: "urssaf",
          auto: true,
          label: urssafLabel(d.periodStart, d.periodEnd),
          ...d,
        });
      } else {
        keep.add(match.id);
        if (match.paidOn === null) {
          await tx
            .update(deadlines)
            .set({ amountDue: d.amountDue, dueOn: d.dueOn })
            .where(eq(deadlines.id, match.id));
        }
      }
    }
    // Unpaid generated deadlines that no longer apply (e.g. periodicity changed).
    const stale = existing.filter((e) => !keep.has(e.id) && e.paidOn === null).map((e) => e.id);
    if (stale.length > 0) await tx.delete(deadlines).where(inArray(deadlines.id, stale));
  });
  return result;
}

/** Years that have transactions (to recompute after a settings change). */
export async function yearsWithData(db: Db): Promise<number[]> {
  const rows = await db.selectDistinct({ date: transactions.date }).from(transactions);
  return [...new Set(rows.map((r) => Number(r.date.slice(0, 4))))].sort();
}
