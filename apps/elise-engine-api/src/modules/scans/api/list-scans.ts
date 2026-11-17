import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import type { AppEnv } from "#/types/variables";
import { scanReads } from "#/modules/scan-ledger";
import { listScansSvc } from "#/modules/scans/handlers";
import { listScansDoc } from "#/modules/scans/openapi";
import { AccountHeaderSchema, ScanListQuerySchema } from "#/modules/scans/schemas";

const app = new Hono<AppEnv>();

app.get("/", listScansDoc, zValidator("header", AccountHeaderSchema), zValidator("query", ScanListQuerySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const query = c.req.valid("query");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listScansSvc(scanReads(db), accountId, query)));
  return c.json({ data, error: null });
});

export default app;
