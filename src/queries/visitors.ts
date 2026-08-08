import { eq } from "drizzle-orm";
import { visitors } from "../schema";
import type { TrackingDb } from "../client";
import { hasRealTouchSignal } from "../attribution";

export interface VisitorTouchInput {
  visitorId: string;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  campaignId?: string | null;
  adset?: string | null;
  adsetId?: string | null;
  ad?: string | null;
  adId?: string | null;
  content?: string | null;
  term?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  fbp?: string | null;
  fbclid?: string | null;
  fbc?: string | null;
  deviceType?: string | null;
  browser?: string | null;
  os?: string | null;
}

/**
 * Creates the visitor on first sight (first-touch = last-touch at that
 * moment), or touches an existing one: lastSeenAt always advances, but the
 * last-touch attribution fields only move when this touch carries a real
 * campaign signal (see hasRealTouchSignal). First-touch is never rewritten
 * after creation.
 */
export async function upsertVisitor(db: TrackingDb, input: VisitorTouchInput) {
  const existing = await db.query.visitors.findFirst({ where: eq(visitors.id, input.visitorId) });
  const now = new Date();

  if (!existing) {
    const [row] = await db
      .insert(visitors)
      .values({
        id: input.visitorId,
        firstSeenAt: now,
        lastSeenAt: now,
        firstTouchSource: input.source ?? null,
        firstTouchMedium: input.medium ?? null,
        firstTouchCampaign: input.campaign ?? null,
        firstTouchCampaignId: input.campaignId ?? null,
        firstTouchAdset: input.adset ?? null,
        firstTouchAdsetId: input.adsetId ?? null,
        firstTouchAd: input.ad ?? null,
        firstTouchAdId: input.adId ?? null,
        firstTouchContent: input.content ?? null,
        firstTouchTerm: input.term ?? null,
        firstTouchLandingPage: input.landingPage ?? null,
        firstTouchReferrer: input.referrer ?? null,
        lastTouchSource: input.source ?? null,
        lastTouchMedium: input.medium ?? null,
        lastTouchCampaign: input.campaign ?? null,
        lastTouchCampaignId: input.campaignId ?? null,
        lastTouchAdset: input.adset ?? null,
        lastTouchAdsetId: input.adsetId ?? null,
        lastTouchAd: input.ad ?? null,
        lastTouchAdId: input.adId ?? null,
        lastTouchContent: input.content ?? null,
        lastTouchTerm: input.term ?? null,
        lastTouchLandingPage: input.landingPage ?? null,
        lastTouchReferrer: input.referrer ?? null,
        fbp: input.fbp ?? null,
        fbclid: input.fbclid ?? null,
        fbc: input.fbc ?? null,
        deviceType: input.deviceType ?? null,
        browser: input.browser ?? null,
        os: input.os ?? null,
      })
      .returning();
    return row;
  }

  const touched = hasRealTouchSignal({
    utmSource: input.source,
    fbclid: input.fbclid,
    referrer: input.referrer,
  });

  const [row] = await db
    .update(visitors)
    .set({
      lastSeenAt: now,
      deviceType: input.deviceType ?? existing.deviceType,
      browser: input.browser ?? existing.browser,
      os: input.os ?? existing.os,
      fbp: input.fbp ?? existing.fbp,
      ...(touched
        ? {
            lastTouchSource: input.source ?? null,
            lastTouchMedium: input.medium ?? null,
            lastTouchCampaign: input.campaign ?? null,
            lastTouchCampaignId: input.campaignId ?? null,
            lastTouchAdset: input.adset ?? null,
            lastTouchAdsetId: input.adsetId ?? null,
            lastTouchAd: input.ad ?? null,
            lastTouchAdId: input.adId ?? null,
            lastTouchContent: input.content ?? null,
            lastTouchTerm: input.term ?? null,
            lastTouchLandingPage: input.landingPage ?? null,
            lastTouchReferrer: input.referrer ?? null,
            fbclid: input.fbclid ?? existing.fbclid,
            fbc: input.fbc ?? existing.fbc,
          }
        : {}),
    })
    .where(eq(visitors.id, input.visitorId))
    .returning();
  return row;
}
