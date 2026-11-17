import { Hono } from "hono";
import { GithubBranchesQuerySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requireScanAccess } from "#/lib/require-scan-access";
import { zValidator } from "#/lib/zod-validator";
import { listGithubBranchesSvc } from "#/modules/github-installs/handlers";
import { githubPortFor } from "#/modules/github-installs/lib";
import { listGithubBranchesDoc } from "#/modules/github-installs/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/branches", listGithubBranchesDoc, requireScanAccess, zValidator("header", AccountHeaderSchema), zValidator("query", GithubBranchesQuerySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const query = c.req.valid("query");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listGithubBranchesSvc(db, githubPortFor(c.env), accountId, query)));
  return c.json({ data, error: null });
});

export default app;
