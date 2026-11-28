import { Hono } from "hono";
import { FindingCommentParamSchema, UpdateFindingCommentBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { updateFindingCommentSvc } from "#/modules/finding-comments/handlers";
import { updateFindingCommentDoc } from "#/modules/finding-comments/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.patch(
  "/:commentId",
  updateFindingCommentDoc,
  requirePower("company:findings:comments:create"),
  zValidator("header", AccountHeaderSchema),
  zValidator("param", FindingCommentParamSchema),
  zValidator("json", UpdateFindingCommentBodySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { commentId } = c.req.valid("param");
    const { body } = c.req.valid("json");
    const userId = userIdOf(c);
    const data = await c
      .get("deps")
      .withTenant(c, accountId, (db) =>
        runEffect(updateFindingCommentSvc(db, accountId, userId, commentId, body, c.env.DATA_MASTER_KEY)),
      );
    return c.json({ data, error: null });
  },
);

export default app;
