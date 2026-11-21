import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { startPlanCheckoutSvc } from "#/modules/plan/handlers";
import { createPlanCheckoutDoc } from "#/modules/plan/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/checkout", createPlanCheckoutDoc, requirePower("company:plan:manage"), zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const userId = userIdOf(c);
  const deps = c.get("deps");
  const data = await deps.withTenant(c, accountId, (db) => runEffect(startPlanCheckoutSvc(db, deps.stripe(c.env), c.env.DASHBOARD_URL, accountId, userId)));
  return c.json({ data, error: null });
});

export default app;
