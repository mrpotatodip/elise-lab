import { Hono } from "hono";
import { SignUpBodySchema } from "@repo/contracts/elise";
import { ConflictError } from "#/lib/errors";
import { SIGN_UP_REFUSED } from "#/modules/sign-up/constants";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { createAccountSvc } from "#/modules/sign-up/handlers";
import { requireSignUpLimit, requireSignUpTotalLimit } from "#/modules/sign-up/lib";
import { authConfigOf } from "#/lib/auth";
import { createAccountDoc } from "#/modules/sign-up/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/", createAccountDoc, requireSignUpLimit, requireSignUpTotalLimit, zValidator("json", SignUpBodySchema), async (c) => {
  const body = c.req.valid("json");
  const passed = await c.get("deps").verifyTurnstile(c.env, body.turnstileToken, c.req.header("cf-connecting-ip"));
  if (!passed) throw new ConflictError(SIGN_UP_REFUSED);
  const data = await c.get("deps").withOwner(c, (db) => runEffect(createAccountSvc(db, body, authConfigOf(c, db))));
  return c.json({ data, error: null }, 201);
});

export default app;
