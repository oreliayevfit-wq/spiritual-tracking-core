import { createTestDb } from "../testSupport";
import * as schema from "../schema";
import { logIntegrationEvent } from "./integrationLogs";

describe("logIntegrationEvent", () => {
  it("writes a log row with source/level/message/context", async () => {
    const db = await createTestDb();

    await logIntegrationEvent(db, {
      source: "meta_capi",
      level: "error",
      message: "CAPI request failed",
      context: { status: 400, leadId: "abc" },
    });

    const rows = await db.select().from(schema.integrationLogs);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("meta_capi");
    expect(rows[0].level).toBe("error");
    expect(rows[0].context).toEqual({ status: 400, leadId: "abc" });
  });

  it("never throws even if given a huge context object", async () => {
    const db = await createTestDb();
    await expect(
      logIntegrationEvent(db, { source: "ravmesser", level: "info", message: "ok", context: { a: "x".repeat(5000) } }),
    ).resolves.not.toThrow();
  });
});
