import { eq, and, gt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { events, leads, visitors } from "../schema";
import type { TrackingDb } from "../client";

// Protects against a double-click or a network retry firing the same
// submission twice in quick succession — not a "one lead per email ever"
// rule. A genuinely new inquiry from the same address after this window
// still creates a new lead row.
const DUPLICATE_LEAD_WINDOW_MS = 30_000;

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
  // Merged into the canonical "lead" event's metadata alongside leadId — e.g.
  // the raw form fields a consuming app collected that don't map onto a named
  // column here. Full fidelity of what the visitor actually submitted stays
  // recoverable even when this table's fixed columns don't cover it.
  eventMetadata?: Record<string, unknown>;
}

/**
 * The one and only lead-creation path. Runs as a single DB transaction:
 * insert the lead (attribution frozen at this exact moment), insert the
 * canonical "lead" event, and link the visitor to it. All-or-nothing.
 *
 * This is the business-critical path — callers must await it and only report
 * success to the end user once it resolves. Nothing here talks to Rav Messer
 * or Meta; those are strictly downstream of a successful commit.
 *
 * Idempotent-ish against duplicate submissions: an advisory lock scoped to
 * this transaction serializes concurrent calls for the same email (so two
 * near-simultaneous requests from a real double-click can't both pass the
 * duplicate check before either commits), and a lead created for the same
 * email+visitor within the last 30s is returned as-is instead of duplicated.
 *
 * Returns `isDuplicate: true` on the dedup-hit path so callers (namely: the
 * downstream Meta/Rav Messer dispatch) can skip re-running side effects for
 * a lead that already had them run — a duplicate lead row is prevented, but
 * without this flag a duplicate *submission* would still fire a second CAPI
 * call and queue a second retry job for the exact same lead.
 */
export async function createLeadTransactional(
  db: TrackingDb,
  input: CreateLeadInput,
): Promise<{ lead: typeof leads.$inferSelect; isDuplicate: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.email}))`);

    const cutoff = new Date(Date.now() - DUPLICATE_LEAD_WINDOW_MS);
    const recentDuplicate = await tx.query.leads.findFirst({
      where: and(
        eq(leads.email, input.email),
        input.visitorId ? eq(leads.visitorId, input.visitorId) : undefined,
        gt(leads.createdAt, cutoff),
      ),
    });
    if (recentDuplicate) {
      return { lead: recentDuplicate, isDuplicate: true };
    }

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
        metadata: { leadId: lead.id, ...input.eventMetadata },
        experimentId: input.experimentId ?? null,
        variantId: input.variantId ?? null,
        occurredAt: lead.createdAt,
      });
    }

    if (input.visitorId) {
      await tx.update(visitors).set({ leadId: lead.id }).where(eq(visitors.id, input.visitorId));
    }

    return { lead, isDuplicate: false };
  });
}
