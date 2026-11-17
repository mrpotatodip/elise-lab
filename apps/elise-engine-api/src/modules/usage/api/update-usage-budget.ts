import { Effect } from "effect";
import { Hono } from "hono";
import { UpdateUsageBudgetBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { activeScansEffect } from "#/modules/scan-ledger";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import { updateUsageBudgetSvc } from "#/modules/usage/handlers";
import { updateUsageBudgetDoc } from "#/modules/usage/openapi";
import { monthSpendEffect } from "#/modules/usage/queries";
import { monthStartOf } from "#/modules/usage/utils";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.patch("/budget", updateUsageBudgetDoc, requirePower("company:usage:budget:update"), zValidator("header", AccountHeaderSchema), zValidator("json", UpdateUsageBudgetBodySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { monthlyBudgetUsd } = c.req.valid("json");
  const userId = userIdOf(c);
  const data = await c.get("deps").withTenant(c, accountId, (db) =>
    runEffect(
      monthSpendEffect(db, accountId, monthStartOf(new Date())).pipe(
        Effect.flatMap((spend) =>
          updateUsageBudgetSvc(c.env, db, { activeSince: (id, nowMs) => activeScansEffect(db, id, nowMs) }, accountId, userId, monthlyBudgetUsd, spend),
        ),
      ),
    ),
  );
  return c.json({ data, error: null });
});

export default app;
