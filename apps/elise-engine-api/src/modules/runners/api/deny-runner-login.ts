import { Hono } from "hono";
import { DenyRunnerLoginBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { denyRunnerLoginSvc } from "#/modules/runners/handlers";
import { denyRunnerLoginDoc } from "#/modules/runners/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post(
  "/login/deny",
  denyRunnerLoginDoc,
  requirePower("company:runners:create"),
  zValidator("header", AccountHeaderSchema),
  zValidator("json", DenyRunnerLoginBodySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const body = c.req.valid("json");
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    const data = await c
      .get("deps")
      .withTenant(c, accountId, (db) => runEffect(denyRunnerLoginSvc(db, accountId, userIdOf(c), ip, body)));
    return c.json({ data, error: null });
  },
);

export default app;
