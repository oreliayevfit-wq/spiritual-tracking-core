export * as schema from "./schema";
export type { RavMesserSyncStatus, RavMesserJobStatus, IntegrationLogLevel } from "./schema";

export { createTrackingDb } from "./client";
export type { TrackingDb } from "./client";

export { upsertVisitor } from "./queries/visitors";
export type { VisitorTouchInput } from "./queries/visitors";

export { upsertSession } from "./queries/sessions";
export type { SessionInput } from "./queries/sessions";

export { insertEvent } from "./queries/events";
export type { EventInput } from "./queries/events";

export { createLeadTransactional } from "./queries/leads";
export type { CreateLeadInput } from "./queries/leads";

export { hasRealTouchSignal, isKnownAdReferrer } from "./attribution";
export type { TouchSignal } from "./attribution";

export { logIntegrationEvent } from "./queries/integrationLogs";
export type { LogIntegrationEventInput } from "./queries/integrationLogs";

export {
  enqueueRavMesserSyncJob,
  claimDueRavMesserSyncJobs,
  completeRavMesserSyncJob,
  failRavMesserSyncJob,
  updateLeadRavMesserStatus,
  getLeadForJob,
  nextBackoffMs,
} from "./queries/ravMesserSyncJobs";
export type { RavMesserLeadStatusUpdate } from "./queries/ravMesserSyncJobs";
