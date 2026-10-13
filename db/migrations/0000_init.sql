CREATE TYPE "public"."deadline_kind" AS ENUM('urssaf', 'tva', 'impot', 'cfe', 'autre');--> statement-breakpoint
CREATE TYPE "public"."provision_kind" AS ENUM('urssaf', 'cfp', 'impot', 'tva');--> statement-breakpoint
CREATE TYPE "public"."transaction_kind" AS ENUM('encaissement', 'frais_pro', 'paiement_echeance', 'autre');--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"date" date PRIMARY KEY NOT NULL,
	"amount" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "deadline_kind" NOT NULL,
	"label" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"due_on" date NOT NULL,
	"amount_due" bigint NOT NULL,
	"paid_on" date,
	"paid_amount" bigint,
	"auto" boolean DEFAULT false NOT NULL,
	CONSTRAINT "deadlines_period" UNIQUE("kind","period_start","period_end","auto")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"client" text NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date,
	"amount_ht" bigint NOT NULL,
	"vat_amount" bigint DEFAULT 0 NOT NULL,
	"paid_on" date,
	"note" text,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_amounts_positive" CHECK ("invoices"."amount_ht" >= 0 and "invoices"."vat_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "projections" (
	"year" integer PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"kind" "provision_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"rate_version" text NOT NULL,
	CONSTRAINT "provisions_tx_kind" UNIQUE("transaction_id","kind")
);
--> statement-breakpoint
CREATE TABLE "settings_patches" (
	"id" serial PRIMARY KEY NOT NULL,
	"valid_from" date NOT NULL,
	"patch" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_patches_valid_from_unique" UNIQUE("valid_from")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL,
	"kind" "transaction_kind" NOT NULL,
	"vat_amount" bigint DEFAULT 0 NOT NULL,
	"invoice_id" integer,
	"deadline_id" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"row_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_row_hash_unique" UNIQUE("row_hash")
);
--> statement-breakpoint
ALTER TABLE "provisions" ADD CONSTRAINT "provisions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_deadline_id_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadlines"("id") ON DELETE set null ON UPDATE no action;