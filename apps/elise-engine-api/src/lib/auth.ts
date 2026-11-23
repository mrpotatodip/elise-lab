import type { Context } from "hono";
import { and, eq, gt, isNull, lte, ne, or } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, getSessionFromCtx, APIError } from "better-auth/api";
import { bearer, twoFactor } from "better-auth/plugins";
import { z } from "zod";
import { sha256Hex } from "@repo/db-elise";
import { authAccount, authSession, authTwoFactor, authUser, authVerification } from "@repo/db-elise/schema";
import { poolConnect, type PoolDbType } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import type { QueuedEmail, TwoFactorNoticeEmail } from "#/modules/email";
import { accountRequiresTwoFactorEffect, auditTwoFactorChange, loginIsTwoFactorAdminEffect } from "#/modules/two-factor";
import type { AppEnv } from "#/types/variables";

// -----
// /auth/* is mounted whole, so every built-in
// endpoint with no flow here is off: sign-up
// (POST /sign-up does it), social logins, and
// account changes or emails nothing can send.
// -----
export const AUTH_DISABLED_PATHS = [
  "/sign-up/email",
  "/sign-in/social",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/account-info",
  "/get-access-token",
  "/refresh-token",
  "/send-verification-email",
  "/change-email",
  "/change-password",
  "/update-user",
  "/delete-user",
  "/delete-user/callback",
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
  "/two-factor/get-totp-uri",
];

export const TWO_FACTOR_MAX_FAILURES = 5;
export const TWO_FACTOR_LOCK_SECONDS = 15 * 60;
const TWO_FACTOR_ISSUER = "EliseLAB";

type CodeProof = { holds: (headers: Headers | undefined, code: string) => Promise<boolean> };

const TWO_FACTOR_COOKIE_NAME = "two_factor";
const PROOF_HEADER = "x-two-factor-proof";
const SIX_DIGITS = /^\d{6}$/;
const windowIdentifier = (userId: string) => `two-factor-window:${userId}`;
const LOCK_FRESH_SECONDS = 10;
const CODE_PATHS = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);
type AuthHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

const settle = (work: Promise<unknown>, what: string) => work.catch(() => console.error(`two-factor ${what} failed`));

const challengedUserId = async (ctx: AuthHookContext) => {
  const session = await getSessionFromCtx(ctx);
  if (session) return session.user.id;
  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);
  const key = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!key) return undefined;
  return (await ctx.context.internalAdapter.findVerificationValue(key))?.value;
};

const REVOKING_PATHS = new Set(["/two-factor/disable", "/two-factor/generate-backup-codes", "/two-factor/verify-totp"]);

export type AuthConfig = {
  db: PoolDbType;
  secret: string;
  baseUrl: string;
  trustedOrigins: string[];
  dashboardUrl: string;
  enqueueEmail: (mail: QueuedEmail) => Promise<void>;
  waitUntil?: (promise: Promise<unknown>) => void;
  resetAddressLimiter?: RateLimit;
  verificationAddressLimiter?: RateLimit;
};

const TokenClaimsSchema = z.object({ email: z.string(), iat: z.number() });

const tokenIssued = (token: string) => {
  try {
    const payload = token.split(".")[1] ?? "";
    const parsed = TokenClaimsSchema.safeParse(JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const verifiedUserId = (session: { user: { id: string; emailVerified: boolean } } | null): string | undefined =>
  session?.user.emailVerified ? session.user.id : undefined;

const RESET_TOKEN_SECONDS = 3600;
export const VERIFY_TOKEN_SECONDS = 24 * 3600;

// -----
// Takes plain values, not a Context, so a test
// can sign in against an in-memory database.
// -----
export const buildAuth = (config: AuthConfig) => {
  const proof: CodeProof = { holds: async () => false };
  const enrolling = new Set<string>();
  const proofToken = crypto.randomUUID();

  const expireStaleWindow = async (userId: string) => {
    const identifier = windowIdentifier(userId);
    const [live] = await config.db
      .select({ id: authVerification.id })
      .from(authVerification)
      .where(and(eq(authVerification.identifier, identifier), gt(authVerification.expiresAt, new Date())));
    if (live) return;
    await config.db.delete(authVerification).where(eq(authVerification.identifier, identifier));
    await config.db
      .update(authTwoFactor)
      .set({ failedVerificationCount: 0 })
      .where(and(eq(authTwoFactor.userId, userId), or(isNull(authTwoFactor.lockedUntil), lte(authTwoFactor.lockedUntil, new Date()))));
  };

  const openWindow = async (userId: string) => {
    const identifier = windowIdentifier(userId);
    const [live] = await config.db
      .select({ id: authVerification.id })
      .from(authVerification)
      .where(and(eq(authVerification.identifier, identifier), gt(authVerification.expiresAt, new Date())));
    if (live) return;
    await config.db.insert(authVerification).values({ id: crypto.randomUUID(), identifier, value: "failures", expiresAt: new Date(Date.now() + TWO_FACTOR_LOCK_SECONDS * 1000) });
  };

  const closeWindow = (userId: string) => config.db.delete(authVerification).where(eq(authVerification.identifier, windowIdentifier(userId)));

  const revokeOthers = async (userId: string, keepToken: string | undefined) => {
    const others = keepToken ? and(eq(authSession.userId, userId), ne(authSession.token, keepToken)) : eq(authSession.userId, userId);
    await config.db.delete(authSession).where(others);
  };

  const notify = (to: string, kind: TwoFactorNoticeEmail["kind"]) =>
    settle(config.enqueueEmail({ kind, to, at: new Date().toISOString(), link: `${config.dashboardUrl}/settings/security` }), `${kind} notice`);

  const lockJustBegan = async (userId: string) => {
    const [row] = await config.db.select({ lockedUntil: authTwoFactor.lockedUntil }).from(authTwoFactor).where(eq(authTwoFactor.userId, userId));
    return row?.lockedUntil ? row.lockedUntil.getTime() - Date.now() > (TWO_FACTOR_LOCK_SECONDS - LOCK_FRESH_SECONDS) * 1000 : false;
  };

  const auth = betterAuth({
    database: drizzleAdapter(config.db, {
      provider: "pg",
      usePlural: false,
      schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification, twoFactor: authTwoFactor },
    }),
    // -----
    // The reset link opens the dashboard's page, which
    // posts the token back to /auth/reset-password. A
    // reset signs the account out everywhere.
    // -----
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        if (config.resetAddressLimiter) {
          const key = await sha256Hex(user.email.toLowerCase());
          const { success } = await config.resetAddressLimiter.limit({ key });
          if (!success) return;
        }
        await config.enqueueEmail({
          kind: "password-reset",
          to: user.email,
          link: `${config.dashboardUrl}/reset-password?token=${encodeURIComponent(token)}`,
          expiresAt: new Date(Date.now() + RESET_TOKEN_SECONDS * 1000).toISOString(),
        });
      },
      onPasswordReset: async ({ user }) => {
        await config.db.update(authUser).set({ emailVerified: true }).where(eq(authUser.id, user.id));
        await config
          .enqueueEmail({
            kind: "password-reset-done",
            to: user.email,
            changedAt: new Date().toISOString(),
            link: `${config.dashboardUrl}/forgot-password`,
          })
          .catch(() => console.error("password-reset-done enqueue failed"));
      },
    },
    emailVerification: {
      expiresIn: VERIFY_TOKEN_SECONDS,
      autoSignInAfterVerification: true,
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user, token }) => {
        if (config.verificationAddressLimiter) {
          const key = await sha256Hex(user.email.toLowerCase());
          const { success } = await config.verificationAddressLimiter.limit({ key });
          if (!success) return;
        }
        await config.enqueueEmail({
          kind: "verify-email",
          to: user.email,
          link: `${config.dashboardUrl}/verify-email?token=${encodeURIComponent(token)}`,
          expiresAt: new Date(Date.now() + VERIFY_TOKEN_SECONDS * 1000).toISOString(),
        });
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/two-factor/disable") {
          const session = await getSessionFromCtx(ctx);
          if (session && ((await runEffect(accountRequiresTwoFactorEffect(config.db, session.user.id))) || (await runEffect(loginIsTwoFactorAdminEffect(config.db, session.user.id))))) {
            throw new APIError("FORBIDDEN", { message: "Your account requires Two-factor", code: "TWO_FACTOR_REQUIRED" });
          }
          const body = z.object({ code: z.string().min(1) }).safeParse(ctx.body);
          if (!body.success) throw new APIError("BAD_REQUEST", { message: "A code is required", code: "TWO_FACTOR_CODE_REQUIRED" });
          if (!(await proof.holds(ctx.headers, body.data.code))) throw new APIError("UNAUTHORIZED", { message: "Invalid code", code: "INVALID_CODE" });
          return;
        }
        if (CODE_PATHS.has(ctx.path)) {
          const session = await getSessionFromCtx(ctx);
          if (ctx.path === "/two-factor/verify-totp" && session && !session.user.twoFactorEnabled) enrolling.add(session.session.token);
          const userId = session?.user.id ?? (await challengedUserId(ctx));
          if (userId) await settle(expireStaleWindow(userId), "window reset");
          return;
        }
        if (ctx.path !== "/verify-email") return;
        const token = z.string().safeParse(ctx.query?.token);
        const issued = token.success ? tokenIssued(token.data) : undefined;
        if (!issued) return;
        const [login] = await config.db.select({ createdAt: authUser.createdAt }).from(authUser).where(eq(authUser.email, issued.email));
        if (login && (issued.iat + 1) * 1000 <= login.createdAt.getTime()) {
          throw new APIError("UNAUTHORIZED", { message: "Invalid token", code: "INVALID_TOKEN" });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        const session = CODE_PATHS.has(ctx.path) ? await getSessionFromCtx(ctx) : null;
        const wasEnrolling = ctx.path === "/two-factor/verify-totp" && session ? enrolling.delete(session.session.token) : false;
        if (returned instanceof Error) {
          if (!CODE_PATHS.has(ctx.path) || (returned instanceof APIError && returned.status === "TOO_MANY_REQUESTS")) return;
          const userId = session?.user.id ?? (await challengedUserId(ctx));
          if (userId) await settle(openWindow(userId), "window open");
          if (userId && (await lockJustBegan(userId))) await settle(auditTwoFactorChange(config.db, userId, "two_factor.locked"), "lock audit");
          return;
        }
        if (CODE_PATHS.has(ctx.path)) {
          const user = ctx.context.newSession?.user ?? session?.user;
          if (user) await settle(closeWindow(user.id), "window close");
        }
        if (ctx.path === "/two-factor/verify-backup-code") {
          const user = ctx.context.newSession?.user ?? session?.user;
          if (user && ctx.headers?.get(PROOF_HEADER) !== proofToken) await notify(user.email, "backup-code-used");
          return;
        }
        if (!REVOKING_PATHS.has(ctx.path)) return;
        if (ctx.path === "/two-factor/verify-totp" && !wasEnrolling) return;
        const current = ctx.context.newSession ?? (await getSessionFromCtx(ctx));
        if (!current) return;
        await revokeOthers(current.user.id, current.session.token);
        if (ctx.path === "/two-factor/generate-backup-codes") {
          await notify(current.user.email, "backup-codes-regenerated");
          return;
        }
        const enabled = ctx.path === "/two-factor/verify-totp";
        await settle(auditTwoFactorChange(config.db, current.user.id, enabled ? "two_factor.enabled" : "two_factor.disabled"), "audit");
        await notify(current.user.email, enabled ? "two-factor-enabled" : "two-factor-disabled");
      }),
    },
    disabledPaths: AUTH_DISABLED_PATHS,
    secret: config.secret,
    // -----
    // AUTH_BASE_URL must be a clean origin (no path):
    // better-auth treats any path in baseURL as the
    // whole mount path and drops basePath.
    // -----
    baseURL: config.baseUrl,
    basePath: "/auth",
    trustedOrigins: config.trustedOrigins,
    plugins: [
      bearer(),
      twoFactor({
        issuer: TWO_FACTOR_ISSUER,
        accountLockout: { enabled: true, maxFailedAttempts: TWO_FACTOR_MAX_FAILURES, durationSeconds: TWO_FACTOR_LOCK_SECONDS },
      }),
    ],
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      backgroundTasks: config.waitUntil ? { handler: config.waitUntil } : undefined,
    },
  });

  proof.holds = async (headers, code) => {
    const marked = new Headers(headers);
    marked.set(PROOF_HEADER, proofToken);
    const attempt = SIX_DIGITS.test(code) ? auth.api.verifyTOTP({ body: { code }, headers: marked }) : auth.api.verifyBackupCode({ body: { code, disableSession: true }, headers: marked });
    return attempt.then(
      () => true,
      () => false,
    );
  };

  return auth;
};

// -----
// A pool per request. The caller runs close()
// once it has the answer, through waitUntil, so
// the socket does not outlive the request.
// -----
export const authConfigOf = (c: Context<AppEnv>, db: PoolDbType): AuthConfig => ({
  db,
  secret: c.env.AUTH_SECRET,
  baseUrl: c.env.AUTH_BASE_URL,
  trustedOrigins: c.env.AUTH_TRUSTED_ORIGINS.split(","),
  dashboardUrl: c.env.DASHBOARD_URL,
  enqueueEmail: (mail) => c.get("deps").enqueueEmail(c.env, mail),
  waitUntil: (promise) => c.executionCtx.waitUntil(promise),
  resetAddressLimiter: c.env.PASSWORD_RESET_ADDRESS_LIMITER,
  verificationAddressLimiter: c.env.VERIFICATION_RESEND_ADDRESS_LIMITER,
});

export const createAuth = (c: Context<AppEnv>) => {
  const { db, close } = poolConnect(c.env.DATABASE_URL);
  const auth = buildAuth(authConfigOf(c, db));
  return { auth, close: () => c.executionCtx.waitUntil(close()) };
};
