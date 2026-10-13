CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "agent_knowledge" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_knowledge_kind_ref" UNIQUE("kind","ref")
);
--> statement-breakpoint
CREATE TABLE "agent_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"thread_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"title" text NOT NULL,
	"markdown" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_knowledge_embedding" ON "agent_knowledge" USING hnsw ("embedding" vector_cosine_ops);