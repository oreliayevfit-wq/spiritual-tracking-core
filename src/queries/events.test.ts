import { createTestDb } from "../testSupport";
import { visitors, sessions } from "../schema";
import { insertEvent } from "./events";

const VISITOR_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SESSION_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

describe("insertEvent", () => {
  it("inserts an event tied to a visitor and session, with metadata", async () => {
    const db = await createTestDb();
    await db.insert(visitors).values({ id: VISITOR_ID });
    await db.insert(sessions).values({ id: SESSION_ID, visitorId: VISITOR_ID, siteKey: "main" });

    const row = await insertEvent(db, {
      id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      visitorId: VISITOR_ID,
      sessionId: SESSION_ID,
      eventName: "cta_click",
      page: "/lp",
      metadata: { buttonId: "hero-cta" },
    });

    expect(row.eventName).toBe("cta_click");
    expect(row.metadata).toEqual({ buttonId: "hero-cta" });
  });
});
