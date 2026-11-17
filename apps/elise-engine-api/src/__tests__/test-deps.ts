import { Effect } from "effect";
import type { AppDeps } from "#/types/variables";
import { memoryScanRepo } from "./memory-scan-repo";
import { noGithubAccess } from "./no-github-access";
import { noTenantDb } from "./no-tenant-db";

// -----
// Every AppDeps a route test needs, answered without a database: no
// session, a caller who holds a role and every Power, a fresh ledger,
// no GitHub, no tenant database. A test passes only the deps it
// changes, so a new dep is added here once, not in every test file.
// -----
export const testDeps = (overrides: Partial<AppDeps> = {}): AppDeps => ({
  scanRepo: () => memoryScanRepo().repo,
  githubAccess: noGithubAccess,
  monthSpend: () => Effect.succeed({ spentUsd: 0, scans: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, budgetOverrideUsd: null, budgetAllowanceUsd: null, platformSpentUsd: 0, platformReservedUsd: 0, ownKey: true, plan: null }),
  holdCredit: () => Effect.succeed({ held: true, balanceUsd: 0 }),
  releaseCredit: () => Effect.succeed({ settled: true, chargeUsd: 0 }),
  sessionUserId: async () => undefined,
  userHasAccount: async () => true,
  userHasPower: async () => true,
  enqueueInviteEmail: async () => undefined,
  enqueuePasswordResetEmail: async () => undefined,
  withTenant: noTenantDb,
  ...overrides,
});
