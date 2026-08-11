ALTER TABLE "events" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_logs" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rav_messer_sync_jobs" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "events_is_test_idx" ON "events" USING btree ("is_test");--> statement-breakpoint
CREATE INDEX "integration_logs_is_test_idx" ON "integration_logs" USING btree ("is_test");--> statement-breakpoint
CREATE INDEX "leads_is_test_idx" ON "leads" USING btree ("is_test");--> statement-breakpoint
CREATE INDEX "sessions_is_test_idx" ON "sessions" USING btree ("is_test");