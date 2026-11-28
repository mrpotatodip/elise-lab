import { Effect } from "effect";
import { Hono } from "hono";
import { CreditEntriesQuerySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { creditEntriesEffect } from "#/modules/credit/queries";
import { getCreditEntriesDoc } from "#/modules/credit/openapi";
import { unsealerEffect } from "#/modules/sealed-data";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get(
  "/entries",
  getCreditEntriesDoc,
  requirePower("company:plan:read"),
  zValidator("header", AccountHeaderSchema),
  zValidator("query", CreditEntriesQuerySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const query = c.req.valid("query");
    const data = await c
      .get("deps")
      .withTenant(c, accountId, (db) =>
        runEffect(
          Effect.flatMap(unsealerEffect(db, c.env.DATA_MASTER_KEY, accountId), (unsealer) =>
            creditEntriesEffect(db, accountId, query, unsealer),
          ),
        ),
      );
    return c.json({ data, error: null });
  },
);

export default app;
