import { Effect } from "effect";
import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { creditBalanceOf } from "#/modules/credit/utils";
import { getCreditDoc } from "#/modules/credit/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import { monthSpendEffect, monthStartOf } from "#/modules/usage";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/", getCreditDoc, zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const data = await c
    .get("deps")
    .withTenant(c, accountId, (db) =>
      runEffect(monthSpendEffect(db, accountId, monthStartOf(new Date())).pipe(Effect.map(creditBalanceOf))),
    );
  return c.json({ data, error: null });
});

export default app;
