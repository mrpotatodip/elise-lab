import { Hono } from "hono";
import { ResendVerificationBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { requireResendLimit, sendVerificationEmailQuietly } from "#/modules/sign-up/lib";
import { resendVerificationDoc } from "#/modules/sign-up/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/resend-verification", resendVerificationDoc, requireResendLimit, zValidator("json", ResendVerificationBodySchema), async (c) => {
  const { email } = c.req.valid("json");
  await c.get("deps").withOwner(c, (db) => runEffect(sendVerificationEmailQuietly(c, db, email)));
  return c.json({ data: { requested: true as const }, error: null }, 200);
});

export default app;
