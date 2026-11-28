import { Hono } from "hono";
import { RepoParamSchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { restoreRepoSvc } from "#/modules/repos/handlers";
import { restoreRepoDoc } from "#/modules/repos/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post(
  "/:repoId/restore",
  restoreRepoDoc,
  requirePower("company:repos:delete"),
  zValidator("header", AccountHeaderSchema),
  zValidator("param", RepoParamSchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { repoId } = c.req.valid("param");
    const data = await c
      .get("deps")
      .withTenant(c, accountId, (db) =>
        runEffect(restoreRepoSvc(db, accountId, repoId, userIdOf(c), c.env.DATA_MASTER_KEY)),
      );
    return c.json({ data, error: null });
  },
);

export default app;
