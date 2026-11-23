import { Hono } from "hono";
import { TeamMemberParamSchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import { resetTwoFactorSvc } from "#/modules/team/handlers";
import { resetTeamMemberTwoFactorDoc } from "#/modules/team/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/members/:partyId/two-factor/reset", resetTeamMemberTwoFactorDoc, requirePower("company:team:two_factor:reset"), zValidator("header", AccountHeaderSchema), zValidator("param", TeamMemberParamSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { partyId } = c.req.valid("param");
  const userId = userIdOf(c);
  const data = await c.get("deps").withOwner(c, (db) => runEffect(resetTwoFactorSvc(db, accountId, userId, partyId)));
  return c.json({ data, error: null });
});

export default app;
