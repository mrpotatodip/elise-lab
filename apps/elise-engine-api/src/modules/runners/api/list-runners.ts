import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { listRunnersSvc } from "#/modules/runners/handlers";
import { requireAccountMember } from "#/modules/runners/lib";
import { listRunnersDoc } from "#/modules/runners/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/", listRunnersDoc, requireAccountMember, zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listRunnersSvc(db, accountId)));
  return c.json({ data, error: null });
});

export default app;
