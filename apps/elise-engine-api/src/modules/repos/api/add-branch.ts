import { Hono } from "hono";
import { RepoParamSchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { addBranchSvc } from "#/modules/repos/handlers";
import { addBranchDoc } from "#/modules/repos/openapi";
import { AddBranchBodySchema } from "#/modules/repos/schemas";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/:repoId/branches", addBranchDoc, zValidator("header", AccountHeaderSchema), zValidator("param", RepoParamSchema), zValidator("json", AddBranchBodySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { repoId } = c.req.valid("param");
  const body = c.req.valid("json");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(addBranchSvc(db, accountId, repoId, body)));
  return c.json({ data, error: null });
});

export default app;
