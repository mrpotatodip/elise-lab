import type { Context } from "hono";
import type { Effect } from "effect";
import type { AccessPower } from "@repo/contracts/elise";
import type { TenantDbType } from "#/lib/db-connection";
import type { DbError } from "#/lib/effect-query";
import type { HoldResult, SettleResult } from "#/modules/credit";
import type { GithubAccess } from "#/modules/github-installs";
import type { ScanRepo } from "#/modules/scan-ledger";
import type { MonthSpend } from "#/modules/usage";
import type { FullScanSandbox } from "#/modules/scan-sandbox";
import type { PasswordResetEmail, QueuedEmail } from "#/modules/auth/types";
import type { InviteEmail } from "#/modules/team/types";
import type { ScanParams } from "#/schemas";

export type Bindings = {
  ENVIRONMENT: string;
  MODEL: string;
  EFFORT: string;
  MAX_BUDGET_FULL_USD: string;
  MAX_ACTIVE_SCANS: string;
  MAX_ACTIVE_FULL_SCANS: string;
  MAX_GLOBAL_FULL_SCANS: string;
  MONTHLY_BUDGET_USD: string;
  BUDGET_ALLOWANCE_USD: string;
  BILLING_ENFORCED: string;
  ANTHROPIC_API_KEY: string;
  KEY_ENCRYPTION_SECRET?: string;
  SCAN_API_TOKEN: string;
  DATABASE_URL: string;
  HYPERDRIVE_TENANT: Hyperdrive;
  AUTH_SECRET: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  AUTH_BASE_URL: string;
  AUTH_TRUSTED_ORIGINS: string;
  SIGN_UP_LIMITER?: RateLimit;
  SIGN_IN_LIMITER?: RateLimit;
  TEAM_INVITE_LIMITER?: RateLimit;
  RUNNER_ENROLL_LIMITER?: RateLimit;
  RUNNER_ENROLL_TOTAL_LIMITER?: RateLimit;
  RUNNER_LOGIN_START_LIMITER?: RateLimit;
  RUNNER_LOGIN_START_TOTAL_LIMITER?: RateLimit;
  PASSWORD_RESET_LIMITER?: RateLimit;
  DASHBOARD_URL: string;
  INVITE_FROM: string;
  EMAIL: SendEmail;
  INVITE_EMAIL_QUEUE: Queue<QueuedEmail>;
  REPORTS: R2Bucket;
  SANDBOX_FULL: DurableObjectNamespace<FullScanSandbox>;
  SCAN_WORKFLOW_FULL: Workflow<ScanParams>;
};

// -----
// The two questions the access checks ask, so a
// test can answer them without a database.
// -----
export type AppDeps = {
  scanRepo: (env: Bindings, db: TenantDbType) => ScanRepo;
  githubAccess: (env: Bindings, accountId: string) => GithubAccess;
  monthSpend: (db: TenantDbType, accountId: string) => Effect.Effect<MonthSpend, DbError>;
  holdCredit: (db: TenantDbType, accountId: string, scanId: string, holdUsd: number) => Effect.Effect<HoldResult, DbError>;
  runnerConnected: (db: TenantDbType, accountId: string, runnerId: string) => Effect.Effect<boolean, DbError>;
  releaseCredit: (db: TenantDbType, accountId: string, scanId: string) => Effect.Effect<SettleResult, DbError>;
  sessionUserId: (c: Context<AppEnv>) => Promise<string | undefined>;
  userHasAccount: (c: Context<AppEnv>, userId: string, accountId: string) => Promise<boolean>;
  userHasPower: (c: Context<AppEnv>, userId: string, accountId: string, power: AccessPower) => Promise<boolean>;
  enqueueInviteEmail: (env: Bindings, mail: InviteEmail) => Promise<void>;
  enqueuePasswordResetEmail: (env: Bindings, mail: PasswordResetEmail) => Promise<void>;
  withTenant: <T>(c: Context<AppEnv>, accountId: string, run: (db: TenantDbType) => Promise<T>) => Promise<T>;
};

export type Variables = { userId?: string; deps: AppDeps };

export type AppEnv = { Bindings: Bindings; Variables: Variables };
