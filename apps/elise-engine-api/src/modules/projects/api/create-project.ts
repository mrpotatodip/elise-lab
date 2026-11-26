import { Hono } from "hono";
import { CreateProjectBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { createProjectSvc } from "#/modules/projects/handlers";
import { createProjectDoc } from "#/modules/projects/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post(
  "/",
  createProjectDoc,
  requirePower("company:repos:delete"),
  zValidator("header", AccountHeaderSchema),
  zValidator("json", CreateProjectBodySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { name } = c.req.valid("json");
    const data = await c
      .get("deps")
      .withTenant(c, accountId, (db) => runEffect(createProjectSvc(db, accountId, userIdOf(c), name)));
    return c.json({ data, error: null }, 201);
  },
);

export default app;
