import { Hono } from "hono";
import { MoveRepoBodySchema, RepoParamSchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { moveRepoSvc } from "#/modules/projects/handlers";
import { moveRepoProjectDoc } from "#/modules/projects/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.put("/:repoId/project", moveRepoProjectDoc, requirePower("company:dashboard:read"), zValidator("header", AccountHeaderSchema), zValidator("param", RepoParamSchema), zValidator("json", MoveRepoBodySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { repoId } = c.req.valid("param");
  const { projectId } = c.req.valid("json");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(moveRepoSvc(db, accountId, userIdOf(c), repoId, projectId)));
  return c.json({ data, error: null });
});

export default app;
