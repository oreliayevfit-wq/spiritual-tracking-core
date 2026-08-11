import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";

// visitors.leadId intentionally has no DB-level FK to leads: leads.visitorId already
// carries the real FK in the other direction, and Drizzle's pg-core doesn't support
// clean mutual pgTable() references without forward-declaration ceremony. leadId here
// is an application-level backpointer only, set once a visitor converts.
export const visitors = pgTable("visitors", {
  id: uuid("id").primaryKey(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),

  // First touch — written once, on creation, never overwritten after.
  firstTouchSource: varchar("first_touch_source", { length: 128 }),
  firstTouchMedium: varchar("first_touch_medium", { length: 128 }),
  firstTouchCampaign: varchar("first_touch_campaign", { length: 255 }),
  firstTouchCampaignId: varchar("first_touch_campaign_id", { length: 128 }),
  firstTouchAdset: varchar("first_touch_adset", { length: 255 }),
  firstTouchAdsetId: varchar("first_touch_adset_id", { length: 128 }),
  firstTouchAd: varchar("first_touch_ad", { length: 255 }),
  firstTouchAdId: varchar("first_touch_ad_id", { length: 128 }),
  firstTouchContent: varchar("first_touch_content", { length: 255 }),
  firstTouchTerm: varchar("first_touch_term", { length: 255 }),
  firstTouchLandingPage: text("first_touch_landing_page"),
  firstTouchReferrer: text("first_touch_referrer"),

  // Last touch — overwritten only by a session carrying a real campaign signal
  // (utm_source, fbclid, or a known ad/search/social referrer). A direct repeat
  // visit with no campaign signal must not reset this to "direct".
  lastTouchSource: varchar("last_touch_source", { length: 128 }),
  lastTouchMedium: varchar("last_touch_medium", { length: 128 }),
  lastTouchCampaign: varchar("last_touch_campaign", { length: 255 }),
  lastTouchCampaignId: varchar("last_touch_campaign_id", { length: 128 }),
  lastTouchAdset: varchar("last_touch_adset", { length: 255 }),
  lastTouchAdsetId: varchar("last_touch_adset_id", { length: 128 }),
  lastTouchAd: varchar("last_touch_ad", { length: 255 }),
  lastTouchAdId: varchar("last_touch_ad_id", { length: 128 }),
  lastTouchContent: varchar("last_touch_content", { length: 255 }),
  lastTouchTerm: varchar("last_touch_term", { length: 255 }),
  lastTouchLandingPage: text("last_touch_landing_page"),
  lastTouchReferrer: text("last_touch_referrer"),

  fbp: varchar("fbp", { length: 128 }),
  fbclid: varchar("fbclid", { length: 255 }),
  fbc: varchar("fbc", { length: 255 }),

  deviceType: varchar("device_type", { length: 32 }),
  browser: varchar("browser", { length: 64 }),
  os: varchar("os", { length: 64 }),

  leadId: uuid("lead_id"),

  // Explicitly marked by the caller (QA scripts, or a real browser via the
  // SDK's test-mode query param) — never inferred from patterns like the
  // email domain, since that's guessable and unreliable. Production
  // analytics must filter is_test = false; nothing here is deleted, only
  // excluded from reporting.
  isTest: boolean("is_test").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),

    landingPage: text("landing_page"),
    landingPagePath: text("landing_page_path"),
    referrer: text("referrer"),

    utmSource: varchar("utm_source", { length: 128 }),
    utmMedium: varchar("utm_medium", { length: 128 }),
    utmCampaign: varchar("utm_campaign", { length: 255 }),
    utmContent: varchar("utm_content", { length: 255 }),
    utmTerm: varchar("utm_term", { length: 255 }),

    campaignId: varchar("campaign_id", { length: 128 }),
    adsetId: varchar("adset_id", { length: 128 }),
    adId: varchar("ad_id", { length: 128 }),
    campaignName: varchar("campaign_name", { length: 255 }),
    adsetName: varchar("adset_name", { length: 255 }),
    adName: varchar("ad_name", { length: 255 }),
    placement: varchar("placement", { length: 128 }),

    fbclid: varchar("fbclid", { length: 255 }),
    fbp: varchar("fbp", { length: 128 }),
    fbc: varchar("fbc", { length: 255 }),

    deviceType: varchar("device_type", { length: 32 }),
    browser: varchar("browser", { length: 64 }),
    os: varchar("os", { length: 64 }),
    screenSize: varchar("screen_size", { length: 32 }),
    language: varchar("language", { length: 32 }),

    siteKey: varchar("site_key", { length: 64 }).notNull(),
    isBot: boolean("is_bot").notNull().default(false),
    isTest: boolean("is_test").notNull().default(false),
  },
  (table) => [
    index("sessions_visitor_id_idx").on(table.visitorId),
    index("sessions_is_test_idx").on(table.isTest),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    eventName: varchar("event_name", { length: 64 }).notNull(),
    page: text("page"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    // Attribution is deliberately NOT duplicated here — join sessions/visitors
    // for it. This is the highest-volume table; keep it lean.
    metadata: jsonb("metadata"),
    experimentId: uuid("experiment_id"),
    variantId: uuid("variant_id"),
    isTest: boolean("is_test").notNull().default(false),
  },
  (table) => [
    index("events_visitor_id_idx").on(table.visitorId),
    index("events_session_id_idx").on(table.sessionId),
    index("events_event_name_idx").on(table.eventName),
    index("events_occurred_at_idx").on(table.occurredAt),
    index("events_is_test_idx").on(table.isTest),
  ],
);

export const RAV_MESSER_SYNC_STATUSES = ["pending", "synced", "failed"] as const;
export type RavMesserSyncStatus = (typeof RAV_MESSER_SYNC_STATUSES)[number];

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey(),
    visitorId: uuid("visitor_id").references(() => visitors.id),
    sessionId: uuid("session_id").references(() => sessions.id),

    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 64 }),

    status: varchar("status", { length: 32 }).notNull().default("new"),

    landingPage: text("landing_page"),
    experimentId: uuid("experiment_id"),
    variantId: uuid("variant_id"),

    // Frozen at the moment of conversion — never updated by later visitor activity.
    firstTouchSource: varchar("first_touch_source", { length: 128 }),
    firstTouchCampaign: varchar("first_touch_campaign", { length: 255 }),
    firstTouchAdset: varchar("first_touch_adset", { length: 255 }),
    firstTouchAd: varchar("first_touch_ad", { length: 255 }),
    lastTouchSource: varchar("last_touch_source", { length: 128 }),
    lastTouchCampaign: varchar("last_touch_campaign", { length: 255 }),
    lastTouchAdset: varchar("last_touch_adset", { length: 255 }),
    lastTouchAd: varchar("last_touch_ad", { length: 255 }),
    utmSource: varchar("utm_source", { length: 128 }),
    utmMedium: varchar("utm_medium", { length: 128 }),
    utmCampaign: varchar("utm_campaign", { length: 255 }),
    utmContent: varchar("utm_content", { length: 255 }),
    utmTerm: varchar("utm_term", { length: 255 }),
    fbclid: varchar("fbclid", { length: 255 }),
    fbp: varchar("fbp", { length: 128 }),
    fbc: varchar("fbc", { length: 255 }),

    ravMesserContactId: varchar("rav_messer_contact_id", { length: 128 }),
    ravMesserSyncStatus: varchar("rav_messer_sync_status", { length: 16 })
      .notNull()
      .default("pending"),
    ravMesserSyncedAt: timestamp("rav_messer_synced_at", { withTimezone: true }),
    ravMesserError: text("rav_messer_error"),

    isTest: boolean("is_test").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("leads_email_idx").on(table.email), index("leads_is_test_idx").on(table.isTest)],
);

// Allowlist of embeddable sites: siteKey is public (like a GA Measurement ID, not a
// secret) but scopes CORS + basic abuse control on the public ingest endpoints.
export const trackingSites = pgTable("tracking_sites", {
  siteKey: varchar("site_key", { length: 64 }).primaryKey(),
  label: varchar("label", { length: 255 }).notNull(),
  allowedOrigin: text("allowed_origin").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Structured log for downstream integration failures (Meta CAPI, Rav Messer,
// rejected tracking payloads) — read by whoever is debugging a "why didn't
// this lead sync" question, not surfaced to end users.
export const INTEGRATION_LOG_LEVELS = ["info", "warn", "error"] as const;
export type IntegrationLogLevel = (typeof INTEGRATION_LOG_LEVELS)[number];

export const integrationLogs = pgTable(
  "integration_logs",
  {
    id: uuid("id").primaryKey(),
    source: varchar("source", { length: 32 }).notNull(), // "meta_capi" | "ravmesser" | "tracking_ingest"
    level: varchar("level", { length: 16 }).notNull(),
    message: text("message").notNull(),
    context: jsonb("context"),
    isTest: boolean("is_test").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("integration_logs_source_idx").on(table.source),
    index("integration_logs_created_at_idx").on(table.createdAt),
    index("integration_logs_is_test_idx").on(table.isTest),
  ],
);

// Retry queue for failed Rav Messer syncs. A lead's DB row is always written
// first (see createLeadTransactional) — this table exists purely to retry the
// downstream contact-sync later; it is never in the critical path of lead
// capture.
export const RAV_MESSER_JOB_STATUSES = ["pending", "processing", "succeeded", "failed"] as const;
export type RavMesserJobStatus = (typeof RAV_MESSER_JOB_STATUSES)[number];

export const ravMesserSyncJobs = pgTable(
  "rav_messer_sync_jobs",
  {
    id: uuid("id").primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    attempt: integer("attempt").notNull().default(0),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    isTest: boolean("is_test").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("rav_messer_sync_jobs_status_next_attempt_idx").on(table.status, table.nextAttemptAt)],
);
