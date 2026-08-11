import { eq, sql } from "drizzle-orm";
import { createTestDb } from "../testSupport";
import { visitors, sessions } from "../schema";
import { upsertSession } from "./sessions";

const VISITOR_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SESSION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

async function seedVisitor(db: Awaited<ReturnType<typeof createTestDb>>) {
  await db.insert(visitors).values({ id: VISITOR_ID });
}

describe("upsertSession", () => {
  it("creates a new session on first sight, keeping the client-supplied id", async () => {
    const db = await createTestDb();
    await seedVisitor(db);

    const row = await upsertSession(db, {
      sessionId: SESSION_ID,
      visitorId: VISITOR_ID,
      siteKey: "main",
      utmSource: "facebook",
    });

    expect(row.id).toBe(SESSION_ID);
    expect(row.utmSource).toBe("facebook");
  });

  it("touches lastSeenAt on a repeat call within the 30-minute window, keeping the same id and attribution", async () => {
    const db = await createTestDb();
    await seedVisitor(db);
    const first = await upsertSession(db, {
      sessionId: SESSION_ID,
      visitorId: VISITOR_ID,
      siteKey: "main",
      utmSource: "facebook",
    });

    await new Promise((r) => setTimeout(r, 5));
    const second = await upsertSession(db, {
      sessionId: SESSION_ID,
      visitorId: VISITOR_ID,
      siteKey: "main",
      utmSource: "google", // should be ignored — same session, attribution is fixed at creation
    });

    expect(second.id).toBe(SESSION_ID);
    expect(second.utmSource).toBe("facebook");
    expect(second.lastSeenAt.getTime()).toBeGreaterThan(first.lastSeenAt.getTime());
  });

  it("mints a brand-new session id when the existing session is stale (>30min), even though the client sent the old id", async () => {
    const db = await createTestDb();
    await seedVisitor(db);
    await upsertSession(db, {
      sessionId: SESSION_ID,
      visitorId: VISITOR_ID,
      siteKey: "main",
      utmSource: "facebook",
    });

    // Simulate 31 minutes passing by backdating lastSeenAt directly.
    await db
      .update(sessions)
      .set({ lastSeenAt: sql`now() - interval '31 minutes'` })
      .where(eq(sessions.id, SESSION_ID));

    const stale = await upsertSession(db, {
      sessionId: SESSION_ID,
      visitorId: VISITOR_ID,
      siteKey: "main",
      utmSource: "google",
      utmCampaign: "new-visit-campaign",
    });

    expect(stale.id).not.toBe(SESSION_ID);
    expect(stale.utmSource).toBe("google");

    const [oldRow] = await db.select().from(sessions).where(eq(sessions.id, SESSION_ID));
    expect(oldRow.utmSource).toBe("facebook"); // untouched — a distinct row now
  });

  it("propagates isTest on creation and never downgrades it on touch", async () => {
    const db = await createTestDb();
    await seedVisitor(db);

    const created = await upsertSession(db, {
      sessionId: SESSION_ID,
      visitorId: VISITOR_ID,
      siteKey: "main",
      isTest: true,
    });
    expect(created.isTest).toBe(true);

    const touched = await upsertSession(db, {
      sessionId: SESSION_ID,
      visitorId: VISITOR_ID,
      siteKey: "main",
      isTest: false,
    });
    expect(touched.isTest).toBe(true);
  });

  describe("testRunId — test-mode isolation hardening", () => {
    it("stores testRunId on creation, defaulting to null when not provided", async () => {
      const db = await createTestDb();
      await seedVisitor(db);

      const withRun = await upsertSession(db, { sessionId: SESSION_ID, visitorId: VISITOR_ID, siteKey: "main", testRunId: "cccccccc-cccc-cccc-cccc-cccccccccccc" });
      expect(withRun.testRunId).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");

      const otherSessionId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
      const withoutRun = await upsertSession(db, { sessionId: otherSessionId, visitorId: VISITOR_ID, siteKey: "main" });
      expect(withoutRun.testRunId).toBeNull();
    });

    it("a touch within the same session preserves the stored testRunId when none is supplied", async () => {
      const db = await createTestDb();
      await seedVisitor(db);
      await upsertSession(db, { sessionId: SESSION_ID, visitorId: VISITOR_ID, siteKey: "main", testRunId: "cccccccc-cccc-cccc-cccc-cccccccccccc" });

      const touched = await upsertSession(db, { sessionId: SESSION_ID, visitorId: VISITOR_ID, siteKey: "main" });
      expect(touched.testRunId).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
    });
  });
});
