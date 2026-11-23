import { createMiddleware } from "hono/factory";
import { AppError } from "#/lib/errors";
import { hasServiceToken } from "#/lib/require-service-token";
import type { AppEnv } from "#/types/variables";

export class TwoFactorSetupRequiredError extends AppError {
  constructor() {
    super("Set up two-factor sign-in before you continue", 403, "TWO_FACTOR_SETUP_REQUIRED");
  }
}

const EXEMPT = /^\/(auth|me|sign-up|stripe|openapi\.json|docs)(\/|$)/;

export const requireTwoFactor = createMiddleware<AppEnv>(async (c, next) => {
  if (EXEMPT.test(c.req.path)) return next();
  if (!c.req.header("cookie") && !c.req.header("authorization")) return next();
  if (await hasServiceToken(c)) return next();

  const deps = c.get("deps");
  const userId = await deps.sessionUserId(c);
  if (userId && (await deps.twoFactorSetupRequired(c, userId))) throw new TwoFactorSetupRequiredError();
  await next();
});
