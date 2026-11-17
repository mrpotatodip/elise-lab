import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { addRepoSvc } from "#/modules/repos/handlers";
import { addRepoDoc } from "#/modules/repos/openapi";
import { AddRepoBodySchema } from "#/modules/repos/schemas";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/", addRepoDoc, zValidator("header", AccountHeaderSchema), zValidator("json", AddRepoBodySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const body = c.req.valid("json");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(addRepoSvc(db, accountId, body)));
  return c.json({ data, error: null });
});

export default app;
