CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visitor_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"event_name" varchar(64) NOT NULL,
	"page" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"experiment_id" uuid,
	"variant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visitor_id" uuid,
	"session_id" uuid,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"email" varchar(255) NOT NULL,
	"phone" varchar(64),
	"status" varchar(32) DEFAULT 'new' NOT NULL,
	"landing_page" text,
	"experiment_id" uuid,
	"variant_id" uuid,
	"first_touch_source" varchar(128),
	"first_touch_campaign" varchar(255),
	"first_touch_adset" varchar(255),
	"first_touch_ad" varchar(255),
	"last_touch_source" varchar(128),
	"last_touch_campaign" varchar(255),
	"last_touch_adset" varchar(255),
	"last_touch_ad" varchar(255),
	"utm_source" varchar(128),
	"utm_medium" varchar(128),
	"utm_campaign" varchar(255),
	"utm_content" varchar(255),
	"utm_term" varchar(255),
	"fbclid" varchar(255),
	"fbp" varchar(128),
	"fbc" varchar(255),
	"rav_messer_contact_id" varchar(128),
	"rav_messer_sync_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"rav_messer_synced_at" timestamp with time zone,
	"rav_messer_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visitor_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"landing_page" text,
	"landing_page_path" text,
	"referrer" text,
	"utm_source" varchar(128),
	"utm_medium" varchar(128),
	"utm_campaign" varchar(255),
	"utm_content" varchar(255),
	"utm_term" varchar(255),
	"campaign_id" varchar(128),
	"adset_id" varchar(128),
	"ad_id" varchar(128),
	"campaign_name" varchar(255),
	"adset_name" varchar(255),
	"ad_name" varchar(255),
	"placement" varchar(128),
	"fbclid" varchar(255),
	"fbp" varchar(128),
	"fbc" varchar(255),
	"device_type" varchar(32),
	"browser" varchar(64),
	"os" varchar(64),
	"screen_size" varchar(32),
	"language" varchar(32),
	"site_key" varchar(64) NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_sites" (
	"site_key" varchar(64) PRIMARY KEY NOT NULL,
	"label" varchar(255) NOT NULL,
	"allowed_origin" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_touch_source" varchar(128),
	"first_touch_medium" varchar(128),
	"first_touch_campaign" varchar(255),
	"first_touch_campaign_id" varchar(128),
	"first_touch_adset" varchar(255),
	"first_touch_adset_id" varchar(128),
	"first_touch_ad" varchar(255),
	"first_touch_ad_id" varchar(128),
	"first_touch_content" varchar(255),
	"first_touch_term" varchar(255),
	"first_touch_landing_page" text,
	"first_touch_referrer" text,
	"last_touch_source" varchar(128),
	"last_touch_medium" varchar(128),
	"last_touch_campaign" varchar(255),
	"last_touch_campaign_id" varchar(128),
	"last_touch_adset" varchar(255),
	"last_touch_adset_id" varchar(128),
	"last_touch_ad" varchar(255),
	"last_touch_ad_id" varchar(128),
	"last_touch_content" varchar(255),
	"last_touch_term" varchar(255),
	"last_touch_landing_page" text,
	"last_touch_referrer" text,
	"fbp" varchar(128),
	"fbclid" varchar(255),
	"fbc" varchar(255),
	"device_type" varchar(32),
	"browser" varchar(64),
	"os" varchar(64),
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_visitor_id_idx" ON "events" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "events_session_id_idx" ON "events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "events_event_name_idx" ON "events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "events_occurred_at_idx" ON "events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sessions_visitor_id_idx" ON "sessions" USING btree ("visitor_id");