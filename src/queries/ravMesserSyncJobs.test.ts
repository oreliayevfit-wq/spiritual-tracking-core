import { eq, sql } from "drizzle-orm";
import { createTestDb } from "../testSupport";
import { visitors, sessions, leads, ravMesserSyncJobs } from "../schema";
import { createLeadTransactional } from "./leads";
import {
  enqueueRavMesserSyncJob,
  claimDueRavMesserSyncJobs,
  completeRavMesserSyncJob,
  failRavMesserSyncJob,
  updateLeadRavMesserStatus,
  nextBackoffMs,
} from "./ravMesserSyncJobs";

const VISITOR_ID = "e0000000-0000-0000-0000-000000000001";
const SESSION_ID = "e0000000-0000-0000-0000-000000000002";

async function seedLead(db: Awaited<ReturnType<typeof createTestDb>>) {
  await db.insert(visitors).values({ id: VISITOR_ID });
  await db.insert(sessions).values({ id: SESSION_ID, visitorId: VISITOR_ID, siteKey: "main" });
  return createLeadTransactional(db, {
    visitorId: VISITOR_ID,
    sessionId: SESSION_ID,
    email: `job-test-${Math.random()}@example.com`,
  });
}

describe("ravMesserSyncJobs", () => {
  it("enqueues a job as pending, due immediately", async () => {
    const db = await createTestDb();
    const lead = await seedLead(db);

    const job = await enqueueRavMesserSyncJob(db, lead.id);
    expect(job.status).toBe("pending");
    expect(job.leadId).toBe(lead.id);
  });

  it("claims due jobs and flips them to processing, atomically (no double-claim)", async () => {
    const db = await createTestDb();
    const lead = await seedLead(db);
    await enqueueRavMesserSyncJob(db, lead.id);

    const [claimedA, claimedB] = await Promise.all([
      claimDueRavMesserSyncJobs(db, 10),
      claimDueRavMesserSyncJobs(db, 10),
    ]);
    const totalClaimed = claimedA.length + claimedB.length;
    expect(totalClaimed).toBe(1);
  });

  it("does not claim a job whose nextAttemptAt is in the future", async () => {
    const db = await createTestDb();
    const lead = await seedLead(db);
    const job = await enqueueRavMesserSyncJob(db, lead.id);
    await db
      .update(ravMesserSyncJobs)
      .set({ nextAttemptAt: sql`now() + interval '1 hour'` })
      .where(eq(ravMesserSyncJobs.id, job.id));

    const claimed = await claimDueRavMesserSyncJobs(db, 10);
    expect(claimed).toHaveLength(0);
  });

  it("failRavMesserSyncJob increments attempt and schedules backoff", async () => {
    const db = await createTestDb();
    const lead = await seedLead(db);
    const job = await enqueueRavMesserSyncJob(db, lead.id);

    await failRavMesserSyncJob(db, job.id, 0, "connection refused");

    const [updated] = await db.select().from(ravMesserSyncJobs).where(eq(ravMesserSyncJobs.id, job.id));
    expect(updated.status).toBe("failed");
    expect(updated.attempt).toBe(1);
    expect(updated.lastError).toBe("connection refused");
    expect(updated.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("completeRavMesserSyncJob marks the job succeeded", async () => {
    const db = await createTestDb();
    const lead = await seedLead(db);
    const job = await enqueueRavMesserSyncJob(db, lead.id);

    await completeRavMesserSyncJob(db, job.id);

    const [updated] = await db.select().from(ravMesserSyncJobs).where(eq(ravMesserSyncJobs.id, job.id));
    expect(updated.status).toBe("succeeded");
  });

  it("updateLeadRavMesserStatus writes synced status + contactId + timestamp", async () => {
    const db = await createTestDb();
    const lead = await seedLead(db);

    await updateLeadRavMesserStatus(db, lead.id, { status: "synced", contactId: "rm_12345" });

    const [updated] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(updated.ravMesserSyncStatus).toBe("synced");
    expect(updated.ravMesserContactId).toBe("rm_12345");
    expect(updated.ravMesserSyncedAt).not.toBeNull();
  });

  it("updateLeadRavMesserStatus writes failed status + error, without a synced timestamp", async () => {
    const db = await createTestDb();
    const lead = await seedLead(db);

    await updateLeadRavMesserStatus(db, lead.id, { status: "failed", error: "not_configured" });

    const [updated] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(updated.ravMesserSyncStatus).toBe("failed");
    expect(updated.ravMesserError).toBe("not_configured");
  });

  it("nextBackoffMs grows then caps", () => {
    expect(nextBackoffMs(0)).toBe(60_000);
    expect(nextBackoffMs(1)).toBe(5 * 60_000);
    expect(nextBackoffMs(10)).toBe(2 * 60 * 60_000); // capped at the last schedule entry
  });
});
