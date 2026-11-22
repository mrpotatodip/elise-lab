import { Hono } from "hono";
import { UpdateSignalsSettingsBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { getSignalsSettingsSvc, setSignalsEnabledSvc } from "#/modules/signals/handlers";
import { getSignalsSettingsDoc, setSignalsSettingsDoc } from "#/modules/signals/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/", getSignalsSettingsDoc, zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(getSignalsSettingsSvc(db, accountId)));
  return c.json({ data, error: null });
});

app.put("/", setSignalsSettingsDoc, requirePower("company:signals:update"), zValidator("header", AccountHeaderSchema), zValidator("json", UpdateSignalsSettingsBodySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { enabled } = c.req.valid("json");
  const userId = userIdOf(c);
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(setSignalsEnabledSvc(db, accountId, userId, enabled)));
  return c.json({ data, error: null });
});

export default app;
