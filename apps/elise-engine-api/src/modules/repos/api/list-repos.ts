import { Hono } from "hono";
import { RepoListQuerySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { assertPower } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { listReposSvc } from "#/modules/repos/handlers";
import { listReposDoc } from "#/modules/repos/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/", listReposDoc, zValidator("header", AccountHeaderSchema), zValidator("query", RepoListQuerySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { removed } = c.req.valid("query");
  if (removed) await assertPower(c, "company:repos:delete");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listReposSvc(db, accountId, removed === "true")));
  return c.json({ data, error: null });
});

export default app;
