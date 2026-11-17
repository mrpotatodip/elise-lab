import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { requirePower } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import { listTeamRolesSvc } from "#/modules/team/handlers";
import { listTeamRolesDoc } from "#/modules/team/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/roles", listTeamRolesDoc, requirePower("company:team:members:read"), zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listTeamRolesSvc(db, accountId)));
  return c.json({ data, error: null });
});

export default app;
