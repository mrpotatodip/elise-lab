import { Hono } from "hono";
import { TeamInviteTokenParamSchema } from "@repo/contracts/elise";
import { dbConnect } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { previewInviteSvc } from "#/modules/team/handlers";
import { requireInviteLimit } from "#/modules/team/lib";
import { previewTeamInviteDoc } from "#/modules/team/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

// -----
// Owner role on purpose: the invite is found by its token,
// before any Account is known, so there is no app.tenant_id
// to set and the invite tables' policy would hide every row.
// -----
app.get("/invites/:token", previewTeamInviteDoc, requireInviteLimit, zValidator("param", TeamInviteTokenParamSchema), async (c) => {
  const { token } = c.req.valid("param");
  const data = await runEffect(previewInviteSvc(dbConnect(c.env.DATABASE_URL), token));
  return c.json({ data, error: null });
});

export default app;
