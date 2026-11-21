import { Hono } from "hono";
import { PlanChangeBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { changePlanSvc } from "#/modules/plan/handlers";
import { changePlanDoc } from "#/modules/plan/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/change", changePlanDoc, requirePower("company:plan:manage"), zValidator("header", AccountHeaderSchema), zValidator("json", PlanChangeBodySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { planKey } = c.req.valid("json");
  const userId = userIdOf(c);
  const deps = c.get("deps");
  const data = await deps.withTenant(c, accountId, (db) => runEffect(changePlanSvc(db, deps.stripe(c.env), accountId, userId, planKey, new Date())));
  return c.json({ data, error: null });
});

export default app;
