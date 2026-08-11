// End-to-end proof of the test-mode isolation hardening's core guarantees —
// deliberately separate from each function's own unit tests (visitors.test.ts
// etc.), which already cover their individual contracts. This file exercises
// the realistic flow: a QA test session touches a visitor, the test session
// ends, and the SAME visitor then generates genuinely real traffic — proving
// the two properties that matter most:
//   (3) test data is excluded by a straightforward is_test=false filter
//   (4) a real visitor is never permanently stuck as test because of one QA run
import { eq, and } from "drizzle-orm";
import { createTestDb } from "./testSupport";
import { visitors, sessions, events, leads } from "./schema";
import { upsertVisitor } from "./queries/visitors";
import { upsertSession } from "./queries/sessions";
import { insertEvent } from "./queries/events";
import { createLeadTransactional } from "./queries/leads";

const VISITOR_ID = "e0000000-0000-0000-0000-000000000001";
const TEST_RUN_ID = "e0000000-0000-0000-0000-0000000000aa";

describe("test-mode isolation — end-to-end", () => {
  it("a QA test session followed by real traffic from the SAME visitor: test rows stay excluded from an is_test=false filter, and the real rows are correctly is_test=false", async () => {
    const db = await createTestDb();

    // --- QA test session: visitor, session, event, lead — all explicitly test ---
    const testSessionId = "e0000000-0000-0000-0000-000000000002";
    await upsertVisitor(db, { visitorId: VISITOR_ID, source: "facebook", isTest: true, testRunId: TEST_RUN_ID });
    await upsertSession(db, { sessionId: testSessionId, visitorId: VISITOR_ID, siteKey: "main", isTest: true, testRunId: TEST_RUN_ID });
    await insertEvent(db, { id: "e0000000-0000-0000-0000-000000000003", visitorId: VISITOR_ID, sessionId: testSessionId, eventName: "page_view", isTest: true, testRunId: TEST_RUN_ID });
    const { lead: testLead } = await createLeadTransactional(db, {
      visitorId: VISITOR_ID,
      sessionId: testSessionId,
      email: "qa-tester@example.com",
      isTest: true,
      testRunId: TEST_RUN_ID,
    });

    // --- QA session ends; the SAME visitor now generates genuinely real
    // traffic: a brand-new session, a real event, and a real lead. The
    // client (per tracking.js's fix) sends isTest:false / no testRunId. ---
    const realSessionId = "e0000000-0000-0000-0000-000000000004";
    await upsertSession(db, { sessionId: realSessionId, visitorId: VISITOR_ID, siteKey: "main" }); // no isTest -> defaults false
    await insertEvent(db, { id: "e0000000-0000-0000-0000-000000000005", visitorId: VISITOR_ID, sessionId: realSessionId, eventName: "page_view" });
    const { lead: realLead } = await createLeadTransactional(db, {
      visitorId: VISITOR_ID,
      sessionId: realSessionId,
      email: "real-customer@example.com",
    });

    // Property (4): the new session/event/lead are real, despite the SAME
    // visitor having been touched by a real test run earlier.
    const [realSessionRow] = await db.select().from(sessions).where(eq(sessions.id, realSessionId));
    expect(realSessionRow.isTest).toBe(false);
    expect(realSessionRow.testRunId).toBeNull();

    const [realEventRow] = await db.select().from(events).where(eq(events.id, "e0000000-0000-0000-0000-000000000005"));
    expect(realEventRow.isTest).toBe(false);

    expect(realLead.isTest).toBe(false);
    expect(realLead.testRunId).toBeNull();

    // The visitor row's OWN isTest stays true (escalate-only, unchanged,
    // intentional design — see visitors.ts) — this is the one field that
    // does NOT reset, by design, and is why sessions/events/leads deliberately
    // do NOT inherit it and instead carry their own independent isTest.
    const [visitorRow] = await db.select().from(visitors).where(eq(visitors.id, VISITOR_ID));
    expect(visitorRow.isTest).toBe(true);

    // Property (3): a straightforward is_test=false filter — exactly what a
    // production analytics/reporting query would use — correctly excludes
    // every row from the QA test session and includes exactly the real ones.
    const realSessionsFiltered = await db.select().from(sessions).where(and(eq(sessions.visitorId, VISITOR_ID), eq(sessions.isTest, false)));
    expect(realSessionsFiltered.map((s) => s.id)).toEqual([realSessionId]);

    // Two real events land here: the explicit page_view above, and
    // createLeadTransactional's own canonical "lead" event — both correctly
    // is_test=false, and neither is the test session's page_view.
    const realEventsFiltered = await db.select().from(events).where(and(eq(events.visitorId, VISITOR_ID), eq(events.isTest, false)));
    expect(realEventsFiltered.map((e) => e.id)).toContain("e0000000-0000-0000-0000-000000000005");
    expect(realEventsFiltered.every((e) => e.eventName === "page_view" || e.eventName === "lead")).toBe(true);
    expect(realEventsFiltered).toHaveLength(2);

    const realLeadsFiltered = await db.select().from(leads).where(and(eq(leads.visitorId, VISITOR_ID), eq(leads.isTest, false)));
    expect(realLeadsFiltered.map((l) => l.id)).toEqual([realLead.id]);
    expect(realLeadsFiltered.map((l) => l.id)).not.toContain(testLead.id);

    // And the testRunId lets the QA run's rows be found precisely, for
    // cleanup, independent of the visitor's own permanent isTest flag.
    const testRunRows = await db.select().from(sessions).where(eq(sessions.testRunId, TEST_RUN_ID));
    expect(testRunRows.map((s) => s.id)).toEqual([testSessionId]);
  });
});
