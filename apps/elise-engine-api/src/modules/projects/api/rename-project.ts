import { Hono } from "hono";
import { ProjectParamSchema, RenameProjectBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { renameProjectSvc } from "#/modules/projects/handlers";
import { renameProjectDoc } from "#/modules/projects/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.patch(
  "/:projectId",
  renameProjectDoc,
  requirePower("company:repos:delete"),
  zValidator("header", AccountHeaderSchema),
  zValidator("param", ProjectParamSchema),
  zValidator("json", RenameProjectBodySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { projectId } = c.req.valid("param");
    const { name } = c.req.valid("json");
    const data = await c
      .get("deps")
      .withTenant(c, accountId, (db) => runEffect(renameProjectSvc(db, accountId, userIdOf(c), projectId, name)));
    return c.json({ data, error: null });
  },
);

export default app;
