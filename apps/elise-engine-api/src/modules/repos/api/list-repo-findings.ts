import { Hono } from "hono";
import { RepoFindingsQuerySchema, RepoParamSchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { listRepoFindingsSvc } from "#/modules/repos/handlers";
import { listRepoFindingsDoc } from "#/modules/repos/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get(
  "/:repoId/findings",
  listRepoFindingsDoc,
  zValidator("header", AccountHeaderSchema),
  zValidator("param", RepoParamSchema),
  zValidator("query", RepoFindingsQuerySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { repoId } = c.req.valid("param");
    const query = c.req.valid("query");
    const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listRepoFindingsSvc(db, accountId, repoId, query)));
    return c.json({ data, error: null });
  },
);

export default app;
