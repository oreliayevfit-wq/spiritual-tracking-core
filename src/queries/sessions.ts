import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { sessions } from "../schema";
import type { TrackingDb } from "../client";

const SESSION_GAP_MS = 30 * 60 * 1000;

export interface SessionInput {
  sessionId: string;
  visitorId: string;
  siteKey: string;
  landingPage?: string | null;
  landingPagePath?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
  campaignName?: string | null;
  adsetName?: string | null;
  adName?: string | null;
  placement?: string | null;
  fbclid?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  deviceType?: string | null;
  browser?: string | null;
  os?: string | null;
  screenSize?: string | null;
  language?: string | null;
  isTest?: boolean;
  // See visitors.ts's testRunId comment — same semantics (not escalate-only).
  testRunId?: string | null;
}

/**
 * Upserts a session. If the client-supplied sessionId is unknown, creates it.
 * If it's known but stale (>30min since last activity), mints a *new* session
 * row with a fresh id instead of reusing the old one — the server is
 * authoritative on the 30-minute rule, not the client (client-side timers
 * can't be trusted across laptop sleep or multiple tabs). The returned row's
 * `id` may therefore differ from `input.sessionId`; callers must hand the
 * returned id back to the client so it updates its stored sessionId.
 */
export async function upsertSession(db: TrackingDb, input: SessionInput) {
  const existing = await db.query.sessions.findFirst({ where: eq(sessions.id, input.sessionId) });
  const now = new Date();

  if (!existing || now.getTime() - existing.lastSeenAt.getTime() > SESSION_GAP_MS) {
    const [row] = await db
      .insert(sessions)
      .values({
        id: existing ? randomUUID() : input.sessionId,
        visitorId: input.visitorId,
        siteKey: input.siteKey,
        startedAt: now,
        lastSeenAt: now,
        landingPage: input.landingPage ?? null,
        landingPagePath: input.landingPagePath ?? null,
        referrer: input.referrer ?? null,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        utmContent: input.utmContent ?? null,
        utmTerm: input.utmTerm ?? null,
        campaignId: input.campaignId ?? null,
        adsetId: input.adsetId ?? null,
        adId: input.adId ?? null,
        campaignName: input.campaignName ?? null,
        adsetName: input.adsetName ?? null,
        adName: input.adName ?? null,
        placement: input.placement ?? null,
        fbclid: input.fbclid ?? null,
        fbp: input.fbp ?? null,
        fbc: input.fbc ?? null,
        deviceType: input.deviceType ?? null,
        browser: input.browser ?? null,
        os: input.os ?? null,
        screenSize: input.screenSize ?? null,
        language: input.language ?? null,
        isTest: input.isTest ?? false,
        testRunId: input.testRunId ?? null,
      })
      .returning();
    return row;
  }

  const [row] = await db
    .update(sessions)
    .set({
      lastSeenAt: now,
      isTest: existing.isTest || (input.isTest ?? false),
      testRunId: input.testRunId ?? existing.testRunId,
    })
    .where(eq(sessions.id, existing.id))
    .returning();
  return row;
}
