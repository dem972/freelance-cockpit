import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// All amounts are bigint cents, read as JS numbers (safe up to 2^53 cents).
const cents = (name: string) => bigint(name, { mode: "number" });

export const transactionKind = pgEnum("transaction_kind", [
  "encaissement",
  "frais_pro",
  "paiement_echeance",
  "autre",
]);
export const provisionKind = pgEnum("provision_kind", ["urssaf", "cfp", "impot", "tva"]);
export const deadlineKind = pgEnum("deadline_kind", ["urssaf", "tva", "impot", "cfe", "autre"]);

/** Dated settings patches: the timeline of user settings. */
export const settingsPatches = pgTable("settings_patches", {
  id: serial("id").primaryKey(),
  validFrom: date("valid_from").notNull().unique(),
  patch: jsonb("patch").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Forecast for a year (TJM, days, frais), used for months not yet realised. */
export const projections = pgTable("projections", {
  year: integer("year").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    number: text("number").notNull().unique(),
    client: text("client").notNull(),
    issuedOn: date("issued_on").notNull(),
    dueOn: date("due_on"),
    amountHt: cents("amount_ht").notNull(),
    vatAmount: cents("vat_amount").notNull().default(0),
    paidOn: date("paid_on"),
    note: text("note"),
  },
  (t) => [check("invoices_amounts_positive", sql`${t.amountHt} >= 0 and ${t.vatAmount} >= 0`)],
);

export const deadlines = pgTable(
  "deadlines",
  {
    id: serial("id").primaryKey(),
    kind: deadlineKind("kind").notNull(),
    label: text("label").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    dueOn: date("due_on").notNull(),
    amountDue: cents("amount_due").notNull(),
    paidOn: date("paid_on"),
    paidAmount: cents("paid_amount"),
    /** Generated from provisions (Urssaf); its amount follows recomputations until paid. */
    auto: boolean("auto").notNull().default(false),
  },
  (t) => [unique("deadlines_period").on(t.kind, t.periodStart, t.periodEnd, t.auto)],
);

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  label: text("label").notNull(),
  amount: cents("amount").notNull(),
  kind: transactionKind("kind").notNull(),
  vatAmount: cents("vat_amount").notNull().default(0),
  invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  deadlineId: integer("deadline_id").references(() => deadlines.id, { onDelete: "set null" }),
  /** "manual" in v1; CSV / DSP2 sources later. */
  source: text("source").notNull().default("manual"),
  /** Deduplication key for imported rows (null for manual entries). */
  rowHash: text("row_hash").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const provisions = pgTable(
  "provisions",
  {
    id: serial("id").primaryKey(),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    kind: provisionKind("kind").notNull(),
    amount: cents("amount").notNull(),
    /** Rates the amount was computed with (see engine rateVersion). */
    rateVersion: text("rate_version").notNull(),
  },
  (t) => [unique("provisions_tx_kind").on(t.transactionId, t.kind)],
);

/** Real bank balance observed on a date. */
export const balanceSnapshots = pgTable("balance_snapshots", {
  date: date("date").primaryKey(),
  amount: cents("amount").notNull(),
});
