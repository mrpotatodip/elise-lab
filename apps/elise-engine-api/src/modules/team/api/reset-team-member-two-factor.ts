import { Hono } from "hono";
import { TeamMemberParamSchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { QueuedEmail } from "#/modules/email";
import { resetTwoFactorSvc } from "#/modules/team/handlers";
import { resetTeamMemberTwoFactorDoc } from "#/modules/team/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/members/:partyId/two-factor/reset", resetTeamMemberTwoFactorDoc, requirePower("company:team:two_factor:reset"), zValidator("header", AccountHeaderSchema), zValidator("param", TeamMemberParamSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { partyId } = c.req.valid("param");
  const userId = userIdOf(c);
  const deps = c.get("deps");
  const mailer = { dashboardUrl: c.env.DASHBOARD_URL, enqueue: (mail: QueuedEmail) => deps.enqueueEmail(c.env, mail) };
  const data = await deps.withOwner(c, (db) => runEffect(resetTwoFactorSvc(db, accountId, userId, partyId, mailer)));
  return c.json({ data, error: null });
});

export default app;
