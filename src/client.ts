import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "./schema";

export type TrackingDb = NodePgDatabase<typeof schema>;

export function createTrackingDb(pool: Pool): TrackingDb {
  return drizzle(pool, { schema });
}
