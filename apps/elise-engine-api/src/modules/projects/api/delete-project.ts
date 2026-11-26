import { Hono } from "hono";
import { ProjectParamSchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { deleteProjectSvc } from "#/modules/projects/handlers";
import { deleteProjectDoc } from "#/modules/projects/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.delete("/:projectId", deleteProjectDoc, requirePower("company:dashboard:read"), zValidator("header", AccountHeaderSchema), zValidator("param", ProjectParamSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { projectId } = c.req.valid("param");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(deleteProjectSvc(db, accountId, userIdOf(c), projectId)));
  return c.json({ data, error: null });
});

export default app;
