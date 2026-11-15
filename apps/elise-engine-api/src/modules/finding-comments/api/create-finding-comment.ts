import { Hono } from "hono";
import { CreateFindingCommentBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { createFindingCommentSvc } from "#/modules/finding-comments/handlers";
import { createFindingCommentDoc } from "#/modules/finding-comments/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post(
  "/",
  createFindingCommentDoc,
  requirePower("company:findings:comments:create"),
  zValidator("header", AccountHeaderSchema),
  zValidator("json", CreateFindingCommentBodySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const body = c.req.valid("json");
    const userId = userIdOf(c);
    const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(createFindingCommentSvc(db, accountId, userId, body)));
    return c.json({ data, error: null }, 201);
  },
);

export default app;
