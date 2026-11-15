import { Hono } from "hono";
import { FindingCommentsQuerySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { findingThreadSvc } from "#/modules/finding-comments/handlers";
import { getFindingThreadDoc } from "#/modules/finding-comments/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/", getFindingThreadDoc, zValidator("header", AccountHeaderSchema), zValidator("query", FindingCommentsQuerySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const query = c.req.valid("query");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(findingThreadSvc(db, accountId, query)));
  return c.json({ data, error: null });
});

export default app;
