import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { leads, ravMesserSyncJobs } from "../schema";
import type { TrackingDb } from "../client";

export async function enqueueRavMesserSyncJob(db: TrackingDb, leadId: string, isTest = false) {
  const [job] = await db
    .insert(ravMesserSyncJobs)
    .values({ id: randomUUID(), leadId, status: "pending", isTest })
    .returning();
  return job;
}

// Atomically claims up to `limit` due jobs by flipping them to "processing" in
// the same statement that selects them (UPDATE ... FROM subquery), so two
// concurrent retry-runner invocations can't both pick up the same job.
export async function claimDueRavMesserSyncJobs(
  db: TrackingDb,
  limit = 10,
): Promise<(typeof ravMesserSyncJobs.$inferSelect)[]> {
  const result = await db.execute(sql`
    with claimed as (
      select id from rav_messer_sync_jobs
      where status in ('pending', 'failed') and next_attempt_at <= now()
      order by next_attempt_at
      limit ${limit}
      for update skip locked
    )
    update rav_messer_sync_jobs
    set status = 'processing', updated_at = now()
    where id in (select id from claimed)
    returning *
  `);
  return result.rows as unknown as (typeof ravMesserSyncJobs.$inferSelect)[];
}

const BACKOFF_SCHEDULE_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
export function nextBackoffMs(attempt: number): number {
  return BACKOFF_SCHEDULE_MS[Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1)];
}

export async function completeRavMesserSyncJob(db: TrackingDb, jobId: string) {
  await db
    .update(ravMesserSyncJobs)
    .set({ status: "succeeded", updatedAt: new Date() })
    .where(eq(ravMesserSyncJobs.id, jobId));
}

export async function failRavMesserSyncJob(db: TrackingDb, jobId: string, attempt: number, error: string) {
  await db
    .update(ravMesserSyncJobs)
    .set({
      status: "failed",
      attempt: attempt + 1,
      lastError: error.slice(0, 2000),
      nextAttemptAt: new Date(Date.now() + nextBackoffMs(attempt)),
      updatedAt: new Date(),
    })
    .where(eq(ravMesserSyncJobs.id, jobId));
}

export interface RavMesserLeadStatusUpdate {
  status: "pending" | "synced" | "failed";
  contactId?: string | null;
  error?: string | null;
}

export async function updateLeadRavMesserStatus(db: TrackingDb, leadId: string, update: RavMesserLeadStatusUpdate) {
  await db
    .update(leads)
    .set({
      ravMesserSyncStatus: update.status,
      ravMesserContactId: update.contactId ?? undefined,
      ravMesserError: update.error ?? null,
      ravMesserSyncedAt: update.status === "synced" ? new Date() : undefined,
    })
    .where(eq(leads.id, leadId));
}

// Used by the retry runner to look up which lead a claimed job belongs to.
export async function getLeadForJob(db: TrackingDb, leadId: string) {
  return db.query.leads.findFirst({ where: eq(leads.id, leadId) });
}
