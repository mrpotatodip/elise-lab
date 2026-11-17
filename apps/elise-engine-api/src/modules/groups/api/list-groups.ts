import { Hono } from "hono";

import { runEffect } from "#/lib/effect-query";
import { requirePower } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { listGroupsSvc } from "#/modules/groups/handlers";
import { listGroupsDoc } from "#/modules/groups/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/", listGroupsDoc, requirePower("company:team:groups:read"), zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listGroupsSvc(db, accountId)));
  return c.json({ data, error: null });
});

export default app;
