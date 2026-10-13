import { and, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  BalanceSnapshot,
  DeadlineInput,
  InvoiceInput,
  IsoDate,
  Projection,
  SettingsTimeline,
  TransactionInput,
} from "@fc/shared";
import type { Db } from "../db.js";
import {
  balanceSnapshots,
  deadlines,
  invoices,
  projections,
  provisions,
  settingsPatches,
  transactions,
} from "../db/schema.js";
import { idParam, notFound, parse, yearParam } from "../http.js";
import { loadProjection, loadTimeline, recomputeYear, yearsWithData } from "../services/ledger.js";

export interface LedgerDeps {
  db: Db;
  /** Today's date, injected so the API (and tests) control the clock. */
  today: () => IsoDate;
}

const yearOf = (date: string) => Number(date.slice(0, 4));

export function ledgerRoutes({ db, today }: LedgerDeps) {
  const app = new Hono();
  const recompute = (...years: number[]) =>
    Promise.all([...new Set(years)].map((y) => recomputeYear(db, y, today())));
  const thisYear = () => yearOf(today());

  // --- Settings timeline -------------------------------------------------
  app.get("/settings", async (c) => c.json(await loadTimeline(db)));

  app.put("/settings", async (c) => {
    const timeline = parse(SettingsTimeline, await c.req.json());
    await db.transaction(async (tx) => {
      await tx.delete(settingsPatches);
      await tx
        .insert(settingsPatches)
        .values(timeline.map((p) => ({ validFrom: p.validFrom, patch: p.settings })));
    });
    await recompute(...(await yearsWithData(db)));
    return c.json(await loadTimeline(db));
  });

  // --- Projection ---------------------------------------------------------
  app.get("/projections/:year", async (c) => {
    const year = yearParam(c.req.param("year"), thisYear());
    return c.json(await loadProjection(db, year));
  });

  app.put("/projections/:year", async (c) => {
    const year = yearParam(c.req.param("year"), thisYear());
    const projection = parse(Projection, { ...(await c.req.json<object>()), year });
    await db
      .insert(projections)
      .values({ year, data: projection })
      .onConflictDoUpdate({
        target: projections.year,
        set: { data: projection, updatedAt: new Date() },
      });
    await recompute(year);
    return c.json(projection);
  });

  // --- Invoices ----------------------------------------------------------
  app.get("/invoices", async (c) => {
    const year = yearParam(c.req.query("year"), thisYear());
    const rows = await db
      .select()
      .from(invoices)
      .where(
        and(
          gte(invoices.issuedOn, `${String(year)}-01-01`),
          lte(invoices.issuedOn, `${String(year)}-12-31`),
        ),
      )
      .orderBy(invoices.issuedOn, invoices.id);
    return c.json(rows);
  });

  app.post("/invoices", async (c) => {
    const input = parse(InvoiceInput, await c.req.json());
    const [row] = await db.insert(invoices).values(input).returning();
    return c.json(row, 201);
  });

  app.put("/invoices/:id", async (c) => {
    const id = idParam(c.req.param("id"));
    const input = parse(InvoiceInput, await c.req.json());
    const [row] = await db.update(invoices).set(input).where(eq(invoices.id, id)).returning();
    return row === undefined ? notFound() : c.json(row);
  });

  app.delete("/invoices/:id", async (c) => {
    const id = idParam(c.req.param("id"));
    const [row] = await db.delete(invoices).where(eq(invoices.id, id)).returning();
    return row === undefined ? notFound() : c.body(null, 204);
  });

  /** Marks an invoice paid and records the matching encaissement. */
  app.post("/invoices/:id/pay", async (c) => {
    const id = idParam(c.req.param("id"));
    const { date } = parse(z.object({ date: IsoDate }), await c.req.json());
    const transaction = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .update(invoices)
        .set({ paidOn: date })
        .where(eq(invoices.id, id))
        .returning();
      if (invoice === undefined) notFound();
      const [created] = await tx
        .insert(transactions)
        .values({
          date,
          label: `Facture ${invoice.number} : ${invoice.client}`,
          amount: invoice.amountHt + invoice.vatAmount,
          vatAmount: invoice.vatAmount,
          kind: "encaissement",
          invoiceId: invoice.id,
        })
        .returning();
      return created;
    });
    await recompute(yearOf(date));
    return c.json(transaction, 201);
  });

  // --- Transactions ------------------------------------------------------
  app.get("/transactions", async (c) => {
    const year = yearParam(c.req.query("year"), thisYear());
    const rows = await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.date, `${String(year)}-01-01`),
          lte(transactions.date, `${String(year)}-12-31`),
        ),
      )
      .orderBy(transactions.date, transactions.id);
    const provs = await db.select().from(provisions);
    return c.json(
      rows.map((t) => ({
        ...t,
        provisions: provs
          .filter((p) => p.transactionId === t.id)
          .map((p) => ({ kind: p.kind, amount: p.amount, rateVersion: p.rateVersion })),
      })),
    );
  });

  app.post("/transactions", async (c) => {
    const input = parse(TransactionInput, await c.req.json());
    const [row] = await db.insert(transactions).values(input).returning();
    await recompute(yearOf(input.date));
    return c.json(row, 201);
  });

  app.put("/transactions/:id", async (c) => {
    const id = idParam(c.req.param("id"));
    const input = parse(TransactionInput, await c.req.json());
    const [before] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (before === undefined) notFound();
    const [row] = await db
      .update(transactions)
      .set(input)
      .where(eq(transactions.id, id))
      .returning();
    await recompute(yearOf(before.date), yearOf(input.date));
    return c.json(row);
  });

  app.delete("/transactions/:id", async (c) => {
    const id = idParam(c.req.param("id"));
    const [row] = await db.delete(transactions).where(eq(transactions.id, id)).returning();
    if (row === undefined) notFound();
    await recompute(yearOf(row.date));
    return c.body(null, 204);
  });

  // --- Deadlines (échéancier) --------------------------------------------
  app.get("/deadlines", async (c) => {
    const year = yearParam(c.req.query("year"), thisYear());
    const rows = await db
      .select()
      .from(deadlines)
      .where(
        and(
          gte(deadlines.periodStart, `${String(year)}-01-01`),
          lte(deadlines.periodStart, `${String(year)}-12-31`),
        ),
      )
      .orderBy(deadlines.dueOn, deadlines.id);
    return c.json(rows);
  });

  app.post("/deadlines", async (c) => {
    const input = parse(DeadlineInput, await c.req.json());
    const [row] = await db
      .insert(deadlines)
      .values({ ...input, auto: false })
      .returning();
    return c.json(row, 201);
  });

  app.put("/deadlines/:id", async (c) => {
    const id = idParam(c.req.param("id"));
    const input = parse(DeadlineInput, await c.req.json());
    const [row] = await db.update(deadlines).set(input).where(eq(deadlines.id, id)).returning();
    return row === undefined ? notFound() : c.json(row);
  });

  app.delete("/deadlines/:id", async (c) => {
    const id = idParam(c.req.param("id"));
    const [row] = await db
      .delete(deadlines)
      .where(and(eq(deadlines.id, id), eq(deadlines.auto, false)))
      .returning();
    return row === undefined ? notFound() : c.body(null, 204);
  });

  /** Pays a deadline: marks it paid and records the outgoing payment. */
  app.post("/deadlines/:id/pay", async (c) => {
    const id = idParam(c.req.param("id"));
    const body = parse(
      z.object({ date: IsoDate, amount: z.number().int().nonnegative().optional() }),
      await c.req.json(),
    );
    const transaction = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(deadlines).where(eq(deadlines.id, id));
      if (current === undefined) notFound();
      const amount = body.amount ?? current.amountDue;
      await tx
        .update(deadlines)
        .set({ paidOn: body.date, paidAmount: amount })
        .where(eq(deadlines.id, id));
      const [created] = await tx
        .insert(transactions)
        .values({
          date: body.date,
          label: current.label,
          amount: -amount,
          vatAmount: 0,
          kind: "paiement_echeance",
          deadlineId: id,
        })
        .returning();
      return created;
    });
    await recompute(yearOf(body.date));
    return c.json(transaction, 201);
  });

  // --- Bank balance snapshots ------------------------------------------------
  app.get("/balance", async (c) =>
    c.json(await db.select().from(balanceSnapshots).orderBy(balanceSnapshots.date)),
  );

  app.put("/balance", async (c) => {
    const snapshot = parse(BalanceSnapshot, await c.req.json());
    await db
      .insert(balanceSnapshots)
      .values(snapshot)
      .onConflictDoUpdate({
        target: balanceSnapshots.date,
        set: { amount: snapshot.amount },
      });
    return c.json(snapshot);
  });

  return app;
}
