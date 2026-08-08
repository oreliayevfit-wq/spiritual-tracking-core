import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { events, leads, visitors } from "../schema";
import type { TrackingDb } from "../client";

export interface CreateLeadInput {
  visitorId?: string | null;
  sessionId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  landingPage?: string | null;
  experimentId?: string | null;
  variantId?: string | null;
  firstTouchSource?: string | null;
  firstTouchCampaign?: string | null;
  firstTouchAdset?: string | null;
  firstTouchAd?: string | null;
  lastTouchSource?: string | null;
  lastTouchCampaign?: string | null;
  lastTouchAdset?: string | null;
  lastTouchAd?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  fbclid?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

/**
 * The one and only lead-creation path. Runs as a single DB transaction:
 * insert the lead (attribution frozen at this exact moment), insert the
 * canonical "lead" event, and link the visitor to it. All-or-nothing.
 *
 * This is the business-critical path — callers must await it and only report
 * success to the end user once it resolves. Nothing here talks to Rav Messer
 * or Meta; those are strictly downstream of a successful commit.
 */
export async function createLeadTransactional(db: TrackingDb, input: CreateLeadInput) {
  return db.transaction(async (tx) => {
    const leadId = randomUUID();
    const [lead] = await tx
      .insert(leads)
      .values({
        id: leadId,
        visitorId: input.visitorId ?? null,
        sessionId: input.sessionId ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        email: input.email,
        phone: input.phone ?? null,
        landingPage: input.landingPage ?? null,
        experimentId: input.experimentId ?? null,
        variantId: input.variantId ?? null,
        firstTouchSource: input.firstTouchSource ?? null,
        firstTouchCampaign: input.firstTouchCampaign ?? null,
        firstTouchAdset: input.firstTouchAdset ?? null,
        firstTouchAd: input.firstTouchAd ?? null,
        lastTouchSource: input.lastTouchSource ?? null,
        lastTouchCampaign: input.lastTouchCampaign ?? null,
        lastTouchAdset: input.lastTouchAdset ?? null,
        lastTouchAd: input.lastTouchAd ?? null,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        utmContent: input.utmContent ?? null,
        utmTerm: input.utmTerm ?? null,
        fbclid: input.fbclid ?? null,
        fbp: input.fbp ?? null,
        fbc: input.fbc ?? null,
      })
      .returning();

    if (input.visitorId && input.sessionId) {
      await tx.insert(events).values({
        id: randomUUID(),
        visitorId: input.visitorId,
        sessionId: input.sessionId,
        eventName: "lead",
        page: input.landingPage ?? null,
        metadata: { leadId: lead.id },
        experimentId: input.experimentId ?? null,
        variantId: input.variantId ?? null,
        occurredAt: lead.createdAt,
      });
    }

    if (input.visitorId) {
      await tx.update(visitors).set({ leadId: lead.id }).where(eq(visitors.id, input.visitorId));
    }

    return lead;
  });
}
