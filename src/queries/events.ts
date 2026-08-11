import { events } from "../schema";
import type { TrackingDb } from "../client";

export interface EventInput {
  id: string;
  visitorId: string;
  sessionId: string;
  eventName: string;
  page?: string | null;
  metadata?: unknown;
  experimentId?: string | null;
  variantId?: string | null;
  occurredAt?: Date;
  isTest?: boolean;
}

export async function insertEvent(db: TrackingDb, input: EventInput) {
  const [row] = await db
    .insert(events)
    .values({
      id: input.id,
      visitorId: input.visitorId,
      sessionId: input.sessionId,
      eventName: input.eventName,
      page: input.page ?? null,
      metadata: input.metadata ?? null,
      experimentId: input.experimentId ?? null,
      variantId: input.variantId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      isTest: input.isTest ?? false,
    })
    .returning();
  return row;
}
