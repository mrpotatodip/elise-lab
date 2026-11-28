import { Hono } from "hono";
import { ApproveRunnerLoginBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { ForbiddenError, ValidationError } from "#/lib/errors";
import { assertPower, userIdOf } from "#/lib/require-power";
import { requireSession } from "#/lib/require-session";
import { zValidator } from "#/lib/zod-validator";
import { CLI_ACCESS_NO_CHOICE, CLI_ACCESS_ROLE_REFUSED } from "#/modules/cli-access/constants";
import { cliScopePowers } from "#/modules/cli-access/utils";
import { approveRunnerLoginSvc } from "#/modules/runners/handlers";
import { notifyRunnerChange } from "#/modules/runners/lib";
import { approveRunnerLoginDoc } from "#/modules/runners/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post(
  "/login/approve",
  approveRunnerLoginDoc,
  requireSession,
  zValidator("header", AccountHeaderSchema),
  zValidator("json", ApproveRunnerLoginBodySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const body = c.req.valid("json");
    if (!body.runScans && !body.cliScope) throw new ValidationError(CLI_ACCESS_NO_CHOICE);
    const deps = c.get("deps");
    const actorUserId = userIdOf(c);
    if (body.runScans) await assertPower(c, "company:runners:create");
    if (body.cliScope) {
      const held = await Promise.all(
        cliScopePowers(body.cliScope).map((power) => deps.userHasPower(c, actorUserId, accountId, power)),
      );
      if (!held.some(Boolean)) throw new ForbiddenError(CLI_ACCESS_ROLE_REFUSED);
    }
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    const data = await deps.withTenant(c, accountId, (db) =>
      runEffect(approveRunnerLoginSvc(db, accountId, actorUserId, ip, body)),
    );
    if (data.runnerId) {
      await notifyRunnerChange(c, {
        kind: "runner-added",
        power: "company:runners:create",
        accountId,
        runnerId: data.runnerId,
        actorUserId,
      });
    }
    return c.json({ data, error: null });
  },
);

export default app;
