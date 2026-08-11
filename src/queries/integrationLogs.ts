import { randomUUID } from "node:crypto";
import { integrationLogs, type IntegrationLogLevel } from "../schema";
import type { TrackingDb } from "../client";

export interface LogIntegrationEventInput {
  source: string;
  level: IntegrationLogLevel;
  message: string;
  context?: Record<string, unknown>;
  isTest?: boolean;
}

// Never throws — a logging failure must not be able to break the caller
// (which is itself usually already in a downstream/non-critical code path).
export async function logIntegrationEvent(db: TrackingDb, input: LogIntegrationEventInput): Promise<void> {
  try {
    await db.insert(integrationLogs).values({
      id: randomUUID(),
      source: input.source,
      level: input.level,
      message: input.message,
      context: input.context ?? null,
      isTest: input.isTest ?? false,
    });
  } catch (error) {
    console.error("[integrationLogs] failed to write log row", error);
  }
}
