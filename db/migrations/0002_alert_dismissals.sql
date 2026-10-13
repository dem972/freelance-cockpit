CREATE TABLE "alert_dismissals" (
	"key" text PRIMARY KEY NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL
);
