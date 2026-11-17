import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { requirePower } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import { getSettingsChangesSvc } from "#/modules/usage/handlers";
import { getSettingsChangesDoc } from "#/modules/usage/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/changes", getSettingsChangesDoc, requirePower("company:usage:budget:update"), zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(getSettingsChangesSvc(db, accountId)));
  return c.json({ data, error: null });
});

export default app;
