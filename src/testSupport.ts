import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import type { TrackingDb } from "./client";

// Not part of the published build (excluded in tsconfig.build.json) — test-only
// helper. Mirrors the real schema by hand (same convention as
// spiritual-business-dashboard's own pglite-backed tests) rather than running
// drizzle-kit migrations against the in-memory instance.
export async function createTestDb(): Promise<TrackingDb> {
  const client = new PGlite();
  const testDb = drizzle(client, { schema });

  // Each CREATE TABLE runs as its own execute() call — PGlite's extended query
  // protocol (prepared statements) rejects a single call containing multiple
  // ;-separated commands ("cannot insert multiple commands into a prepared
  // statement"), unlike a plain multi-statement SQL script.
  await testDb.execute(sql`
    CREATE TABLE visitors (
      id uuid PRIMARY KEY,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      first_touch_source varchar(128),
      first_touch_medium varchar(128),
      first_touch_campaign varchar(255),
      first_touch_campaign_id varchar(128),
      first_touch_adset varchar(255),
      first_touch_adset_id varchar(128),
      first_touch_ad varchar(255),
      first_touch_ad_id varchar(128),
      first_touch_content varchar(255),
      first_touch_term varchar(255),
      first_touch_landing_page text,
      first_touch_referrer text,
      last_touch_source varchar(128),
      last_touch_medium varchar(128),
      last_touch_campaign varchar(255),
      last_touch_campaign_id varchar(128),
      last_touch_adset varchar(255),
      last_touch_adset_id varchar(128),
      last_touch_ad varchar(255),
      last_touch_ad_id varchar(128),
      last_touch_content varchar(255),
      last_touch_term varchar(255),
      last_touch_landing_page text,
      last_touch_referrer text,
      fbp varchar(128),
      fbclid varchar(255),
      fbc varchar(255),
      device_type varchar(32),
      browser varchar(64),
      os varchar(64),
      lead_id uuid,
      is_test boolean NOT NULL DEFAULT false,
      test_run_id uuid,
      test_classification varchar(32),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE sessions (
      id uuid PRIMARY KEY,
      visitor_id uuid NOT NULL REFERENCES visitors(id),
      started_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      landing_page text,
      landing_page_path text,
      referrer text,
      utm_source varchar(128),
      utm_medium varchar(128),
      utm_campaign varchar(255),
      utm_content varchar(255),
      utm_term varchar(255),
      campaign_id varchar(128),
      adset_id varchar(128),
      ad_id varchar(128),
      campaign_name varchar(255),
      adset_name varchar(255),
      ad_name varchar(255),
      placement varchar(128),
      fbclid varchar(255),
      fbp varchar(128),
      fbc varchar(255),
      device_type varchar(32),
      browser varchar(64),
      os varchar(64),
      screen_size varchar(32),
      language varchar(32),
      site_key varchar(64) NOT NULL,
      is_bot boolean NOT NULL DEFAULT false,
      is_test boolean NOT NULL DEFAULT false,
      test_run_id uuid
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE events (
      id uuid PRIMARY KEY,
      visitor_id uuid NOT NULL REFERENCES visitors(id),
      session_id uuid NOT NULL REFERENCES sessions(id),
      event_name varchar(64) NOT NULL,
      page text,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      metadata jsonb,
      experiment_id uuid,
      variant_id uuid,
      is_test boolean NOT NULL DEFAULT false,
      test_run_id uuid
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE leads (
      id uuid PRIMARY KEY,
      visitor_id uuid REFERENCES visitors(id),
      session_id uuid REFERENCES sessions(id),
      first_name varchar(255),
      last_name varchar(255),
      email varchar(255) NOT NULL,
      phone varchar(64),
      status varchar(32) NOT NULL DEFAULT 'new',
      landing_page text,
      experiment_id uuid,
      variant_id uuid,
      first_touch_source varchar(128),
      first_touch_campaign varchar(255),
      first_touch_adset varchar(255),
      first_touch_ad varchar(255),
      last_touch_source varchar(128),
      last_touch_campaign varchar(255),
      last_touch_adset varchar(255),
      last_touch_ad varchar(255),
      utm_source varchar(128),
      utm_medium varchar(128),
      utm_campaign varchar(255),
      utm_content varchar(255),
      utm_term varchar(255),
      fbclid varchar(255),
      fbp varchar(128),
      fbc varchar(255),
      rav_messer_contact_id varchar(128),
      rav_messer_sync_status varchar(16) NOT NULL DEFAULT 'pending',
      rav_messer_synced_at timestamptz,
      rav_messer_error text,
      is_test boolean NOT NULL DEFAULT false,
      test_run_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE tracking_sites (
      site_key varchar(64) PRIMARY KEY,
      label varchar(255) NOT NULL,
      allowed_origin text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE integration_logs (
      id uuid PRIMARY KEY,
      source varchar(32) NOT NULL,
      level varchar(16) NOT NULL,
      message text NOT NULL,
      context jsonb,
      is_test boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE rav_messer_sync_jobs (
      id uuid PRIMARY KEY,
      lead_id uuid NOT NULL REFERENCES leads(id),
      attempt integer NOT NULL DEFAULT 0,
      status varchar(16) NOT NULL DEFAULT 'pending',
      last_error text,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      is_test boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  return testDb as unknown as TrackingDb;
}
