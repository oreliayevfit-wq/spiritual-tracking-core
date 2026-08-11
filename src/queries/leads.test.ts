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

    const { lead, isDuplicate } = await createLeadTransactional(db, {
      visitorId: VISITOR_ID,
      sessionId: SESSION_ID,
      email: "test@example.com",
      firstTouchSource: "facebook",
      lastTouchSource: "google",
    });

    expect(isDuplicate).toBe(false);
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

    const { lead } = await createLeadTransactional(db, { email: "no-context@example.com" });

    expect(lead.email).toBe("no-context@example.com");
    expect(lead.visitorId).toBeNull();
  });

  it("returns the same lead and isDuplicate:true on a rapid repeat submission (same email+visitor)", async () => {
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

    expect(first.isDuplicate).toBe(false);
    expect(second.isDuplicate).toBe(true);
    expect(second.lead.id).toBe(first.lead.id);
    const rows = await db.select().from(leads).where(eq(leads.email, "dup@example.com"));
    expect(rows).toHaveLength(1);
  });

  it("does NOT merge two concurrent submissions racing each other, and flags exactly one as the duplicate", async () => {
    const db = await createTestDb();
    await seed(db);

    const [a, b] = await Promise.all([
      createLeadTransactional(db, { visitorId: VISITOR_ID, sessionId: SESSION_ID, email: "race@example.com" }),
      createLeadTransactional(db, { visitorId: VISITOR_ID, sessionId: SESSION_ID, email: "race@example.com" }),
    ]);

    expect(a.lead.id).toBe(b.lead.id);
    // The advisory lock serializes them — exactly one of the two calls did
    // the real insert, the other saw it as a duplicate. Never both false,
    // never both true.
    expect([a.isDuplicate, b.isDuplicate].sort()).toEqual([false, true]);
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

    expect(first.isDuplicate).toBe(false);
    expect(second.isDuplicate).toBe(false);
    expect(second.lead.id).not.toBe(first.lead.id);
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
      .where(eq(leads.id, first.lead.id));

    const second = await createLeadTransactional(db, { visitorId: VISITOR_ID, email: "later@example.com" });

    expect(second.isDuplicate).toBe(false);
    expect(second.lead.id).not.toBe(first.lead.id);
    const rows = await db.select().from(leads).where(eq(leads.email, "later@example.com"));
    expect(rows).toHaveLength(2);
  });

  it("marks the lead, its canonical event, and the linked visitor as test when isTest is set", async () => {
    const db = await createTestDb();
    await seed(db);

    const { lead } = await createLeadTransactional(db, {
      visitorId: VISITOR_ID,
      sessionId: SESSION_ID,
      email: "marked-test@example.com",
      isTest: true,
    });

    expect(lead.isTest).toBe(true);

    const [leadEvent] = await db
      .select()
      .from(events)
      .where(eq(events.eventName, "lead"));
    expect(leadEvent.isTest).toBe(true);

    const [visitor] = await db.select().from(visitors).where(eq(visitors.id, VISITOR_ID));
    expect(visitor.isTest).toBe(true);
  });

  it("defaults isTest to false when not specified", async () => {
    const db = await createTestDb();
    await seed(db);

    const { lead } = await createLeadTransactional(db, {
      visitorId: VISITOR_ID,
      sessionId: SESSION_ID,
      email: "not-marked@example.com",
    });

    expect(lead.isTest).toBe(false);
  });

  describe("testRunId — test-mode isolation hardening", () => {
    const RUN_ID = "f0000000-0000-0000-0000-0000000000aa";

    it("stamps testRunId on the lead, its canonical event, and the linked visitor", async () => {
      const db = await createTestDb();
      await seed(db);

      const { lead } = await createLeadTransactional(db, {
        visitorId: VISITOR_ID,
        sessionId: SESSION_ID,
        email: "run-stamped@example.com",
        isTest: true,
        testRunId: RUN_ID,
      });
      expect(lead.testRunId).toBe(RUN_ID);

      const [leadEvent] = await db.select().from(events).where(eq(events.eventName, "lead"));
      expect(leadEvent.testRunId).toBe(RUN_ID);

      const [visitor] = await db.select().from(visitors).where(eq(visitors.id, VISITOR_ID));
      expect(visitor.testRunId).toBe(RUN_ID);
    });

    it("defaults testRunId to null on the lead when not provided", async () => {
      const db = await createTestDb();
      await seed(db);

      const { lead } = await createLeadTransactional(db, {
        visitorId: VISITOR_ID,
        sessionId: SESSION_ID,
        email: "no-run@example.com",
      });
      expect(lead.testRunId).toBeNull();
    });

    it("does NOT touch the visitor's testRunId when this call isn't itself a test", async () => {
      const db = await createTestDb();
      await seed(db);
      // First, a real test run stamps the visitor.
      await createLeadTransactional(db, { visitorId: VISITOR_ID, sessionId: SESSION_ID, email: "a@example.com", isTest: true, testRunId: RUN_ID });
      // Then a genuinely real (non-test) lead from the SAME visitor — must
      // not overwrite or clear the visitor's historical testRunId, matching
      // upsertVisitor's own "omit -> preserve" semantics.
      await createLeadTransactional(db, { visitorId: VISITOR_ID, sessionId: SESSION_ID, email: "b@example.com" });

      const [visitor] = await db.select().from(visitors).where(eq(visitors.id, VISITOR_ID));
      expect(visitor.testRunId).toBe(RUN_ID);
    });
  });
});
