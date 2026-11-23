import { Hono } from "hono";
import { UpdateTeamTwoFactorRequirementBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { QueuedEmail } from "#/modules/email";
import { getTwoFactorRequirementSvc, setTwoFactorRequirementSvc } from "#/modules/team/handlers";
import { getTwoFactorRequirementDoc, setTwoFactorRequirementDoc } from "#/modules/team/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/two-factor-requirement", getTwoFactorRequirementDoc, requirePower("company:team:members:read"), zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(getTwoFactorRequirementSvc(db, accountId)));
  return c.json({ data, error: null });
});

app.put(
  "/two-factor-requirement",
  setTwoFactorRequirementDoc,
  requirePower("company:team:two_factor_requirement:update"),
  zValidator("header", AccountHeaderSchema),
  zValidator("json", UpdateTeamTwoFactorRequirementBodySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { required } = c.req.valid("json");
    const userId = userIdOf(c);
    const deps = c.get("deps");
    const mailer = { dashboardUrl: c.env.DASHBOARD_URL, enqueue: (mail: QueuedEmail) => deps.enqueueEmail(c.env, mail) };
    const data = await deps.withTenant(c, accountId, (db) => runEffect(setTwoFactorRequirementSvc(db, accountId, userId, required, mailer)));
    return c.json({ data, error: null });
  },
);

export default app;
