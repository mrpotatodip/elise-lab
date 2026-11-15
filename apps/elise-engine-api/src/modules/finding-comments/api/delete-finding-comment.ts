import { Hono } from "hono";
import { z } from "zod";
import { runEffect } from "#/lib/effect-query";
import { signedInUserId } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import { deleteFindingCommentSvc } from "#/modules/finding-comments/handlers";
import { deleteFindingCommentDoc } from "#/modules/finding-comments/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.delete("/:commentId", deleteFindingCommentDoc, zValidator("header", AccountHeaderSchema), zValidator("param", z.object({ commentId: z.uuid() })), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { commentId } = c.req.valid("param");
  const deps = c.get("deps");
  const userId = await signedInUserId(c);
  const [holdsDeletePower, holdsCreatePower] = await Promise.all([
    deps.userHasPower(c, userId, accountId, "company:findings:comments:delete"),
    deps.userHasPower(c, userId, accountId, "company:findings:comments:create"),
  ]);
  const data = await deps.withTenant(c, accountId, (db) => runEffect(deleteFindingCommentSvc(db, accountId, commentId, { userId, holdsDeletePower, holdsCreatePower })));
  return c.json({ data, error: null });
});

export default app;
