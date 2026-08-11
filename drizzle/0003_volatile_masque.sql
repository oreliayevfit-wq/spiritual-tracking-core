ALTER TABLE "events" ADD COLUMN "test_run_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "test_run_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "test_run_id" uuid;--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "test_run_id" uuid;--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "test_classification" varchar(32);