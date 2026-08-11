import { eq } from "drizzle-orm";
import { createTestDb } from "../testSupport";
import { visitors } from "../schema";
import { upsertVisitor } from "./visitors";

describe("upsertVisitor", () => {
  it("creates a new visitor with first-touch equal to last-touch", async () => {
    const db = await createTestDb();
    const id = "11111111-1111-1111-1111-111111111111";

    const row = await upsertVisitor(db, {
      visitorId: id,
      source: "facebook",
      campaign: "summer-sale",
      landingPage: "/lp",
    });

    expect(row.firstTouchSource).toBe("facebook");
    expect(row.lastTouchSource).toBe("facebook");
    expect(row.firstTouchCampaign).toBe("summer-sale");
    expect(row.lastTouchCampaign).toBe("summer-sale");
  });

  it("does not overwrite first-touch on a later visit, even with a different source", async () => {
    const db = await createTestDb();
    const id = "22222222-2222-2222-2222-222222222222";

    await upsertVisitor(db, { visitorId: id, source: "facebook", campaign: "first-campaign" });
    const second = await upsertVisitor(db, { visitorId: id, source: "google", campaign: "second-campaign" });

    expect(second.firstTouchSource).toBe("facebook");
    expect(second.firstTouchCampaign).toBe("first-campaign");
  });

  it("overwrites last-touch when the new visit carries a real campaign signal", async () => {
    const db = await createTestDb();
    const id = "33333333-3333-3333-3333-333333333333";

    await upsertVisitor(db, { visitorId: id, source: "facebook", campaign: "first-campaign" });
    const second = await upsertVisitor(db, { visitorId: id, source: "google", campaign: "second-campaign" });

    expect(second.lastTouchSource).toBe("google");
    expect(second.lastTouchCampaign).toBe("second-campaign");
  });

  it("does NOT overwrite last-touch on a direct repeat visit with no campaign signal", async () => {
    const db = await createTestDb();
    const id = "44444444-4444-4444-4444-444444444444";

    await upsertVisitor(db, { visitorId: id, source: "facebook", campaign: "first-campaign" });
    // A plain return visit: no utm source, no fbclid, no ad referrer.
    const second = await upsertVisitor(db, { visitorId: id, referrer: null });

    expect(second.lastTouchSource).toBe("facebook");
    expect(second.lastTouchCampaign).toBe("first-campaign");
  });

  it("treats a known ad referrer as a real signal even without utm_source", async () => {
    const db = await createTestDb();
    const id = "55555555-5555-5555-5555-555555555555";

    await upsertVisitor(db, { visitorId: id, source: "facebook", campaign: "first-campaign" });
    const second = await upsertVisitor(db, {
      visitorId: id,
      referrer: "https://www.google.com/",
      campaign: "organic-google-visit",
    });

    expect(second.lastTouchCampaign).toBe("organic-google-visit");
  });

  it("always advances lastSeenAt regardless of touch signal", async () => {
    const db = await createTestDb();
    const id = "66666666-6666-6666-6666-666666666666";

    const first = await upsertVisitor(db, { visitorId: id, source: "facebook" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await upsertVisitor(db, { visitorId: id });

    expect(second.lastSeenAt.getTime()).toBeGreaterThan(first.lastSeenAt.getTime());

    const [persisted] = await db.select().from(visitors).where(eq(visitors.id, id));
    expect(persisted.lastSeenAt.getTime()).toBe(second.lastSeenAt.getTime());
  });

  it("defaults isTest to false, and once a visitor is touched as test it stays test", async () => {
    const db = await createTestDb();
    const id = "77777777-7777-7777-7777-777777777777";

    const first = await upsertVisitor(db, { visitorId: id });
    expect(first.isTest).toBe(false);

    const marked = await upsertVisitor(db, { visitorId: id, isTest: true });
    expect(marked.isTest).toBe(true);

    // A later non-test touch must not un-mark it — escalate-only.
    const after = await upsertVisitor(db, { visitorId: id, isTest: false });
    expect(after.isTest).toBe(true);
  });

  describe("testRunId — test-mode isolation hardening", () => {
    it("stores testRunId on creation", async () => {
      const db = await createTestDb();
      const id = "88888888-8888-8888-8888-888888888888";
      const runId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

      const row = await upsertVisitor(db, { visitorId: id, isTest: true, testRunId: runId });
      expect(row.testRunId).toBe(runId);
    });

    it("defaults testRunId to null when not provided", async () => {
      const db = await createTestDb();
      const id = "99999999-9999-9999-9999-999999999999";

      const row = await upsertVisitor(db, { visitorId: id });
      expect(row.testRunId).toBeNull();
    });

    it("a later touch with a NEW testRunId overwrites it — NOT escalate-only, unlike isTest", async () => {
      const db = await createTestDb();
      const id = "10101010-1010-1010-1010-101010101010";
      const runA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const runB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

      await upsertVisitor(db, { visitorId: id, isTest: true, testRunId: runA });
      const second = await upsertVisitor(db, { visitorId: id, isTest: true, testRunId: runB });
      expect(second.testRunId).toBe(runB);
    });

    it("a later touch with NO testRunId preserves the previously stored one", async () => {
      const db = await createTestDb();
      const id = "20202020-2020-2020-2020-202020202020";
      const runA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

      await upsertVisitor(db, { visitorId: id, isTest: true, testRunId: runA });
      // A subsequent REAL (non-test) touch that supplies no testRunId at all
      // — e.g. the visitor's normal traffic after their test session ended.
      const second = await upsertVisitor(db, { visitorId: id });
      expect(second.testRunId).toBe(runA);
    });
  });

  describe("testClassification — re-audit support", () => {
    it("defaults to null and is never set implicitly by a normal touch", async () => {
      const db = await createTestDb();
      const id = "30303030-3030-3030-3030-303030303030";

      const row = await upsertVisitor(db, { visitorId: id, isTest: true });
      expect(row.testClassification).toBeNull();
    });
  });
});
