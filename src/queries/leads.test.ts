import { eq } from "drizzle-orm";
import { createTestDb } from "../testSupport";
import { visitors, sessions, leads, events } from "../schema";
import { createLeadTransactional } from "./leads";

const VISITOR_ID = "f0000000-0000-0000-0000-000000000001";
const SESSION_ID = "f0000000-0000-0000-0000-000000000002";

async function seed(db: Awaited<ReturnType<typeof createTestDb>>) {
  await db.insert(visitors).values({ id: VISITOR_ID, firstTouchSource: "facebook" });
  await db.insert(sessions).values({ id: SESSION_ID, visitorId: VISITOR_ID, siteKey: "main" });
}

describe("createLeadTransactional", () => {
  it("inserts the lead, the canonical lead event, and links the visitor — all in one commit", async () => {
    const db = await createTestDb();
    await seed(db);

    const lead = await createLeadTransactional(db, {
      visitorId: VISITOR_ID,
      sessionId: SESSION_ID,
      email: "test@example.com",
      firstTouchSource: "facebook",
      lastTouchSource: "google",
    });

    expect(lead.email).toBe("test@example.com");
    expect(lead.firstTouchSource).toBe("facebook");
    expect(lead.lastTouchSource).toBe("google");

    const [leadEvent] = await db.select().from(events).where(eq(events.eventName, "lead"));
    expect(leadEvent).toBeDefined();
    expect((leadEvent.metadata as { leadId: string }).leadId).toBe(lead.id);

    const [visitor] = await db.select().from(visitors).where(eq(visitors.id, VISITOR_ID));
    expect(visitor.leadId).toBe(lead.id);
  });

  it("rolls back the whole transaction (no orphan lead row) when the event insert fails", async () => {
    const db = await createTestDb();
    await db.insert(visitors).values({ id: VISITOR_ID });
    // Deliberately do NOT create the session — sessionId below references a
    // non-existent session, which violates events.session_id's FK and must
    // abort the entire transaction, including the lead insert that already ran.
    const bogusSessionId = "f0000000-0000-0000-0000-0000000000ff";

    await expect(
      createLeadTransactional(db, {
        visitorId: VISITOR_ID,
        sessionId: bogusSessionId,
        email: "shouldnotpersist@example.com",
      }),
    ).rejects.toThrow();

    const rows = await db.select().from(leads).where(eq(leads.email, "shouldnotpersist@example.com"));
    expect(rows).toHaveLength(0);
  });

  it("creates a lead without visitor/session context (edge case) without throwing", async () => {
    const db = await createTestDb();

    const lead = await createLeadTransactional(db, { email: "no-context@example.com" });

    expect(lead.email).toBe("no-context@example.com");
    expect(lead.visitorId).toBeNull();
  });

  it("returns the same lead instead of duplicating on a rapid repeat submission (same email+visitor)", async () => {
    const db = await createTestDb();
    await seed(db);

    const first = await createLeadTransactional(db, {
      visitorId: VISITOR_ID,
      sessionId: SESSION_ID,
      email: "dup@example.com",
    });
    const second = await createLeadTransactional(db, {
      visitorId: VISITOR_ID,
      sessionId: SESSION_ID,
      email: "dup@example.com",
    });

    expect(second.id).toBe(first.id);
    const rows = await db.select().from(leads).where(eq(leads.email, "dup@example.com"));
    expect(rows).toHaveLength(1);
  });

  it("does NOT merge two concurrent submissions racing each other (advisory lock serializes them)", async () => {
    const db = await createTestDb();
    await seed(db);

    const [a, b] = await Promise.all([
      createLeadTransactional(db, { visitorId: VISITOR_ID, sessionId: SESSION_ID, email: "race@example.com" }),
      createLeadTransactional(db, { visitorId: VISITOR_ID, sessionId: SESSION_ID, email: "race@example.com" }),
    ]);

    expect(a.id).toBe(b.id);
    const rows = await db.select().from(leads).where(eq(leads.email, "race@example.com"));
    expect(rows).toHaveLength(1);
  });

  it("does NOT treat the same email from a different visitor as a duplicate", async () => {
    const db = await createTestDb();
    await seed(db);
    const otherVisitorId = "f0000000-0000-0000-0000-000000000099";
    await db.insert(visitors).values({ id: otherVisitorId });

    const first = await createLeadTransactional(db, { visitorId: VISITOR_ID, email: "shared@example.com" });
    const second = await createLeadTransactional(db, { visitorId: otherVisitorId, email: "shared@example.com" });

    expect(second.id).not.toBe(first.id);
    const rows = await db.select().from(leads).where(eq(leads.email, "shared@example.com"));
    expect(rows).toHaveLength(2);
  });

  it("creates a genuinely new lead once the duplicate window has passed", async () => {
    const db = await createTestDb();
    await seed(db);

    const first = await createLeadTransactional(db, { visitorId: VISITOR_ID, email: "later@example.com" });
    await db
      .update(leads)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(leads.id, first.id));

    const second = await createLeadTransactional(db, { visitorId: VISITOR_ID, email: "later@example.com" });

    expect(second.id).not.toBe(first.id);
    const rows = await db.select().from(leads).where(eq(leads.email, "later@example.com"));
    expect(rows).toHaveLength(2);
  });
});
