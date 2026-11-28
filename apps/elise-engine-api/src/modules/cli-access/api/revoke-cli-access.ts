import { Hono } from "hono";
import { CliAccessParamSchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { revokeCliAccessSvc } from "#/modules/cli-access/handlers";
import { revokeCliAccessDoc } from "#/modules/cli-access/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.delete(
  "/:cliAccessId",
  revokeCliAccessDoc,
  requirePower("company:runners:delete"),
  zValidator("header", AccountHeaderSchema),
  zValidator("param", CliAccessParamSchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { cliAccessId } = c.req.valid("param");
    const actorUserId = userIdOf(c);
    const data = await c
      .get("deps")
      .withTenant(c, accountId, (db) => runEffect(revokeCliAccessSvc(db, accountId, cliAccessId, actorUserId)));
    return c.json({ data, error: null });
  },
);

export default app;
