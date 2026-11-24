import { createServerFn } from "@tanstack/react-start";
import { deleteCookie } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { ResendVerificationBodySchema } from "@repo/contracts/elise";
import { EngineError, engineFetch, jsonPost } from "#/lib/engine-client";
import { tryCatch } from "#/lib/try-catch";
import { saveChallenge } from "../server/challenge";
import type { SignInOutcome } from "../utils";
import { AUTH_COPY, EMAIL_NOT_VERIFIED_CODE, SIGNED_OUT_COOKIE } from "../constants";
import {
  ForgotPasswordSchema,
  ResetPasswordSchema,
  SignInSchema,
  SignUpInputSchema,
  VerifyEmailSchema,
} from "../schemas";
import { clearSessionToken, findSession, saveSessionToken } from "../server/session";

export const fetchSession = createServerFn({ method: "GET" }).handler(async () => (await findSession())?.user ?? null);

const SignInResponseSchema = z.union([
  z.object({ twoFactorRedirect: z.literal(true) }),
  z.object({ token: z.string() }),
]);

export const signIn = createServerFn({ method: "POST" })
  .validator(SignInSchema)
  .handler(async ({ data }): Promise<{ outcome: SignInOutcome; setupRequired: boolean }> => {
    const { data: res, error } = await tryCatch(engineFetch("/auth/sign-in/email", jsonPost(JSON.stringify(data))));
    if (error) {
      if (error instanceof EngineError && error.code === EMAIL_NOT_VERIFIED_CODE)
        return { outcome: "unverified", setupRequired: false };
      throw error;
    }
    const body = SignInResponseSchema.parse(await res.json());
    if ("twoFactorRedirect" in body) {
      saveChallenge(res.headers.getSetCookie());
      return { outcome: "challenge", setupRequired: false };
    }
    saveSessionToken(body.token);
    return { outcome: "session", setupRequired: (await findSession())?.user.twoFactorSetupRequired ?? false };
  });

export const fetchTurnstileSiteKey = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => env.TURNSTILE_SITE_KEY || null,
);

export const signUp = createServerFn({ method: "POST" })
  .validator(SignUpInputSchema)
  .handler(async ({ data }) => {
    await engineFetch("/sign-up", jsonPost(JSON.stringify(data)));
  });

export const resendVerification = createServerFn({ method: "POST" })
  .validator(ResendVerificationBodySchema)
  .handler(async ({ data }) => {
    const { error } = await tryCatch(engineFetch("/sign-up/resend-verification", jsonPost(JSON.stringify(data))));
    if (error instanceof EngineError && error.status === 429) throw new Error(AUTH_COPY.verify.wait, { cause: error });
    if (error) throw error;
  });

export const verifyEmail = createServerFn({ method: "POST" })
  .validator(VerifyEmailSchema)
  .handler(async ({ data }): Promise<{ verified: boolean }> => {
    const { data: res, error } = await tryCatch(
      engineFetch(`/auth/verify-email?token=${encodeURIComponent(data.token)}`),
    );
    if (error) {
      if (error instanceof EngineError && error.status < 500) return { verified: false };
      throw error;
    }
    const token = res.headers.get("set-auth-token");
    if (!token) return { verified: false };
    saveSessionToken(token);
    return { verified: true };
  });

// -----
// The engine answers the same whether or not the email has an account, so the
// page can say nothing about which ones do.
// -----
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator(ForgotPasswordSchema)
  .handler(async ({ data }) => {
    await engineFetch("/auth/request-password-reset", jsonPost(JSON.stringify(data)));
  });

// -----
// A token the engine refuses (400) is spent, expired or made up: say that, not
// the engine's "Invalid token".
// -----
export const resetPassword = createServerFn({ method: "POST" })
  .validator(ResetPasswordSchema)
  .handler(async ({ data }) => {
    try {
      await engineFetch(
        "/auth/reset-password",
        jsonPost(JSON.stringify({ token: data.token, newPassword: data.password })),
      );
    } catch (error) {
      if (error instanceof EngineError && error.status === 400)
        throw new Error(AUTH_COPY.reset.expired, { cause: error });
      throw error;
    }
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const session = await findSession();
  if (session) await engineFetch("/auth/sign-out", { method: "POST" }, { token: session.token }).catch(() => undefined);
  clearSessionToken();
  deleteCookie(SIGNED_OUT_COOKIE, { path: "/" });
});
