CREATE TABLE "integration_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" varchar(32) NOT NULL,
	"level" varchar(16) NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rav_messer_sync_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rav_messer_sync_jobs" ADD CONSTRAINT "rav_messer_sync_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_logs_source_idx" ON "integration_logs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "integration_logs_created_at_idx" ON "integration_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rav_messer_sync_jobs_status_next_attempt_idx" ON "rav_messer_sync_jobs" USING btree ("status","next_attempt_at");