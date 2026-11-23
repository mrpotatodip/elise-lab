import { Hono } from "hono";
import { SignUpBodySchema } from "@repo/contracts/elise";
import { ConflictError } from "#/lib/errors";
import { SIGN_UP_REFUSED } from "#/modules/sign-up/constants";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { createAccountSvc } from "#/modules/sign-up/handlers";
import { requireSignUpLimit, requireSignUpTotalLimit, sendVerificationEmailQuietly } from "#/modules/sign-up/lib";
import { createAccountDoc } from "#/modules/sign-up/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/", createAccountDoc, requireSignUpLimit, requireSignUpTotalLimit, zValidator("json", SignUpBodySchema), async (c) => {
  const body = c.req.valid("json");
  const passed = await c.get("deps").verifyTurnstile(c.env, body.turnstileToken, c.req.header("cf-connecting-ip"));
  if (!passed) throw new ConflictError(SIGN_UP_REFUSED);
  const data = await c.get("deps").withOwner(c, async (db) => {
    const created = await runEffect(createAccountSvc(db, body));
    await runEffect(sendVerificationEmailQuietly(c, db, body.email));
    return created;
  });
  return c.json({ data, error: null }, 201);
});

export default app;
