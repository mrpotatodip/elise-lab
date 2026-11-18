import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { requirePower } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { getPlanOffersDoc } from "#/modules/plan/openapi";
import { offeredPlansEffect } from "#/modules/plan/queries";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/", getPlanOffersDoc, requirePower("company:plan:read"), zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(offeredPlansEffect(db)));
  return c.json({ data, error: null });
});

export default app;
