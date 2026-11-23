import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { ResendVerificationBodySchema } from "@repo/contracts/elise";
import { EngineError, engineFetch, jsonPost } from "#/lib/engine-client";
import { AUTH_COPY } from "../constants";
import { ForgotPasswordSchema, ResetPasswordSchema, SignInSchema, SignUpInputSchema, VerifyEmailSchema } from "../schemas";
import { clearSessionToken, findSession, saveSessionToken } from "../server/session";

export const fetchSession = createServerFn({ method: "GET" }).handler(async () => (await findSession())?.user ?? null);

const SignInResponseSchema = z.object({ token: z.string() });

export const signIn = createServerFn({ method: "POST" })
  .validator(SignInSchema)
  .handler(async ({ data }): Promise<{ verified: boolean }> => {
    try {
      const res = await engineFetch("/auth/sign-in/email", jsonPost(JSON.stringify(data)));
      saveSessionToken(SignInResponseSchema.parse(await res.json()).token);
      return { verified: true };
    } catch (error) {
      if (error instanceof EngineError && error.status === 403) return { verified: false };
      throw error;
    }
  });

export const fetchTurnstileSiteKey = createServerFn({ method: "GET" }).handler(async (): Promise<string | null> => env.TURNSTILE_SITE_KEY || null);

export const signUp = createServerFn({ method: "POST" })
  .validator(SignUpInputSchema)
  .handler(async ({ data }) => {
    await engineFetch("/sign-up", jsonPost(JSON.stringify(data)));
  });

export const resendVerification = createServerFn({ method: "POST" })
  .validator(ResendVerificationBodySchema)
  .handler(async ({ data }) => {
    try {
      await engineFetch("/sign-up/resend-verification", jsonPost(JSON.stringify(data)));
    } catch (error) {
      if (error instanceof EngineError && error.status === 429) throw new Error(AUTH_COPY.verify.wait, { cause: error });
      throw error;
    }
  });

const SESSION_COOKIE_PATTERN = /better-auth\.session_token=([^;]+)/;

export const verifyEmail = createServerFn({ method: "POST" })
  .validator(VerifyEmailSchema)
  .handler(async ({ data }): Promise<{ verified: boolean }> => {
    try {
      const res = await engineFetch(`/auth/verify-email?token=${encodeURIComponent(data.token)}`);
      const token = res.headers.get("set-auth-token") ?? decodeURIComponent(SESSION_COOKIE_PATTERN.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? "");
      if (token) saveSessionToken(token);
      return { verified: true };
    } catch (error) {
      if (error instanceof EngineError && error.status < 500) return { verified: false };
      throw error;
    }
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
      await engineFetch("/auth/reset-password", jsonPost(JSON.stringify({ token: data.token, newPassword: data.password })));
    } catch (error) {
      if (error instanceof EngineError && error.status === 400) throw new Error(AUTH_COPY.reset.expired, { cause: error });
      throw error;
    }
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const session = await findSession();
  if (session) await engineFetch("/auth/sign-out", { method: "POST" }, { token: session.token }).catch(() => undefined);
  clearSessionToken();
});
