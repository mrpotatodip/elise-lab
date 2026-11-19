import { Hono } from "hono";
import { TraceQuerySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { readTraceSvc } from "#/modules/scan-trace/handlers";
import { readTraceDoc } from "#/modules/scan-trace/openapi";
import { AccountHeaderSchema, ScanIdParamSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/:scanId/trace", readTraceDoc, zValidator("header", AccountHeaderSchema), zValidator("param", ScanIdParamSchema), zValidator("query", TraceQuerySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { scanId } = c.req.valid("param");
  const query = c.req.valid("query");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(readTraceSvc(db, accountId, scanId, query)));
  return c.json({ data, error: null });
});

export default app;
