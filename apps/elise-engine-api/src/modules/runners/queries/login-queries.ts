import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { Effect } from "effect";
import { platformRunnerDeviceLogins, tenantCliAccess, tenantRunners, tenants } from "@repo/db-elise";
import {
  RUNNER_LOGIN_SLOW_DOWN_STEP_S,
  type CliAccessScope,
  type PendingRunnerLogin,
  type RunnerIdentity,
} from "@repo/contracts/elise";
import type { AppDbType, DbConnectType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { actorPartyOf, insertAuditEntry } from "#/modules/audit-trail";
import type { NewRunnerLogin, RunnerLoginApproval, RunnerLoginDenial } from "#/modules/runners/types";

export type LoginCollection =
  | { kind: "missing" }
  | { kind: "pending" }
  | { kind: "denied" }
  | { kind: "expired" }
  | { kind: "slow_down"; interval: number }
  | {
      kind: "collected";
      accountId: string;
      accountName: string;
      runner: RunnerIdentity | null;
      cliAccess: { id: string; name: string; scope: CliAccessScope } | null;
    };

type LoginAttempt =
  | Exclude<LoginCollection, { kind: "collected" }>
  | {
      kind: "collected";
      accountId: string;
      runnerRows: { id: string; name: string; tenantId: string }[];
      cliAccess: { id: string; name: string; scope: CliAccessScope } | null;
    };

export type CollectTokens = { runnerTokenHash: string; cliAccessTokenHash: string };

export const startLoginEffect = (db: DbConnectType, login: NewRunnerLogin): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: () => db.insert(platformRunnerDeviceLogins).values(login),
    catch: toDbError,
  }).pipe(Effect.asVoid);

// -----
// What the approval page shows: only a login that is pending and
// unexpired, and never a hash or the device code.
// -----
export const findPendingLoginEffect = (
  db: DbConnectType,
  userCodeHash: string,
  now: Date,
): Effect.Effect<PendingRunnerLogin | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [login] = await db
        .select({
          suggestedName: platformRunnerDeviceLogins.suggestedName,
          os: platformRunnerDeviceLogins.os,
          cpu: platformRunnerDeviceLogins.cpu,
          version: platformRunnerDeviceLogins.runnerVersion,
          requestIp: platformRunnerDeviceLogins.requestIp,
          expiresAt: platformRunnerDeviceLogins.expiresAt,
        })
        .from(platformRunnerDeviceLogins)
        .where(
          and(
            eq(platformRunnerDeviceLogins.userCodeHash, userCodeHash),
            eq(platformRunnerDeviceLogins.state, "pending"),
            gt(platformRunnerDeviceLogins.expiresAt, now),
          ),
        );
      return login ? { ...login, expiresAt: login.expiresAt.toISOString() } : null;
    },
    catch: toDbError,
  });

// -----
// Approving is one UPDATE that matches only a login that is
// pending and unexpired, so two members cannot both win. It
// then makes the Runner row with no token and links it. Run it
// in the Account's transaction: null means no live login, and
// the caller fails so nothing is kept. It writes one Audit trail
// entry in that same transaction.
// -----
export const approveLoginEffect = (
  db: AppDbType,
  approval: RunnerLoginApproval,
): Effect.Effect<{ runnerId: string | null } | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const createdBy = await actorPartyOf(db, approval.actorUserId);
      if (!createdBy) return null;
      const [login] = await db
        .update(platformRunnerDeviceLogins)
        .set({
          state: "approved",
          tenantId: approval.tenantId,
          approvedBy: createdBy,
          approverIp: approval.approverIp,
          approvedAt: approval.now,
          runScans: approval.runScans,
          cliScope: approval.cliScope,
          approvedName: approval.name,
        })
        .where(
          and(
            eq(platformRunnerDeviceLogins.userCodeHash, approval.userCodeHash),
            eq(platformRunnerDeviceLogins.state, "pending"),
            gt(platformRunnerDeviceLogins.expiresAt, approval.now),
          ),
        )
        .returning({
          id: platformRunnerDeviceLogins.id,
          expiresAt: platformRunnerDeviceLogins.expiresAt,
          requestIp: platformRunnerDeviceLogins.requestIp,
        });
      if (!login) return null;
      const [runner] = approval.runScans
        ? await db
            .insert(tenantRunners)
            .values({ tenantId: approval.tenantId, name: approval.name, pairingExpiresAt: login.expiresAt, createdBy })
            .returning({ id: tenantRunners.id })
        : [];
      if (approval.runScans && !runner) return null;
      if (runner)
        await db
          .update(platformRunnerDeviceLogins)
          .set({ runnerId: runner.id })
          .where(eq(platformRunnerDeviceLogins.id, login.id));
      await insertAuditEntry(db, {
        actorPartyId: createdBy,
        action: "runner.login.approve",
        subjectId: runner?.id ?? login.id,
        tenantId: approval.tenantId,
        after: {
          name: approval.name,
          requestIp: login.requestIp,
          approverIp: approval.approverIp,
          runScans: approval.runScans,
          cliScope: approval.cliScope,
        },
      });
      return { runnerId: runner?.id ?? null };
    },
    catch: toDbError,
  });

// -----
// The Runner's check. A login that is unknown or already collected
// is missing, whatever the reason. One past its expiry answers
// "expired" until cleanup deletes it, and an approved one that was
// never collected loses the Runner row its approval made, so no
// half-made Runner stays listed. A check sooner than the interval
// answers "slow_down" and adds 5 seconds to the interval (RFC 8628).
// After approval the token hash is set by one UPDATE that needs no
// token yet, so two checks cannot both collect; the loser is missing.
// The CLI access row is inserted before the Runner token is set and
// before the login is claimed, so a failed insert leaves the login
// approved and collectable; a check that then loses a race deletes
// the row it made, whose token nobody was given.
// -----
export const collectLoginEffect = (
  db: DbConnectType,
  deviceCodeHash: string,
  tokens: CollectTokens,
  now: Date,
): Effect.Effect<LoginCollection, DbError> =>
  Effect.tryPromise({
    try: async (): Promise<LoginAttempt> => {
      const [login] = await db
        .select({
          id: platformRunnerDeviceLogins.id,
          state: platformRunnerDeviceLogins.state,
          runnerId: platformRunnerDeviceLogins.runnerId,
          runScans: platformRunnerDeviceLogins.runScans,
          cliScope: platformRunnerDeviceLogins.cliScope,
          approvedName: platformRunnerDeviceLogins.approvedName,
          suggestedName: platformRunnerDeviceLogins.suggestedName,
          approvedBy: platformRunnerDeviceLogins.approvedBy,
          approvedAt: platformRunnerDeviceLogins.approvedAt,
          tenantId: platformRunnerDeviceLogins.tenantId,
          expiresAt: platformRunnerDeviceLogins.expiresAt,
          lastCheckedAt: platformRunnerDeviceLogins.lastCheckedAt,
          interval: platformRunnerDeviceLogins.checkIntervalSeconds,
        })
        .from(platformRunnerDeviceLogins)
        .where(eq(platformRunnerDeviceLogins.deviceCodeHash, deviceCodeHash));
      if (!login || login.state === "collected") return { kind: "missing" };
      if (login.expiresAt <= now) {
        if (login.runnerId) {
          await db
            .update(platformRunnerDeviceLogins)
            .set({ runnerId: null })
            .where(eq(platformRunnerDeviceLogins.id, login.id));
          await db
            .delete(tenantRunners)
            .where(and(eq(tenantRunners.id, login.runnerId), isNull(tenantRunners.tokenHash)));
        }
        return { kind: "expired" };
      }
      const tooEarly =
        login.lastCheckedAt !== null && now.getTime() - login.lastCheckedAt.getTime() < login.interval * 1000;
      const interval = tooEarly ? login.interval + RUNNER_LOGIN_SLOW_DOWN_STEP_S : login.interval;
      await db
        .update(platformRunnerDeviceLogins)
        .set({ lastCheckedAt: now, checkIntervalSeconds: interval })
        .where(eq(platformRunnerDeviceLogins.id, login.id));
      if (tooEarly) return { kind: "slow_down", interval };
      if (login.state === "pending") return { kind: "pending" };
      if (login.state === "denied") return { kind: "denied" };
      const { tenantId, approvedBy } = login;
      if (login.state !== "approved" || !tenantId || !approvedBy) return { kind: "missing" };
      if (login.runScans && !login.runnerId) return { kind: "missing" };
      const cliName = login.approvedName ?? login.suggestedName;
      const [cliRow] = login.cliScope
        ? await db
            .insert(tenantCliAccess)
            .values({
              tenantId,
              personId: approvedBy,
              name: cliName,
              scope: login.cliScope,
              tokenHash: tokens.cliAccessTokenHash,
              approvedAt: login.approvedAt ?? now,
            })
            .returning({ id: tenantCliAccess.id })
        : [];
      const dropCliAccess = async (): Promise<void> => {
        if (cliRow) await db.delete(tenantCliAccess).where(eq(tenantCliAccess.id, cliRow.id));
      };
      const runnerRows =
        login.runScans && login.runnerId
          ? await db
              .update(tenantRunners)
              .set({ tokenHash: tokens.runnerTokenHash, pairingExpiresAt: null, pairedAt: now, lastSeenAt: now })
              .where(
                and(
                  eq(tenantRunners.id, login.runnerId),
                  isNull(tenantRunners.tokenHash),
                  isNull(tenantRunners.revokedAt),
                ),
              )
              .returning({ id: tenantRunners.id, name: tenantRunners.name, tenantId: tenantRunners.tenantId })
          : [];
      if (login.runScans && runnerRows.length === 0) {
        await dropCliAccess();
        return { kind: "missing" };
      }
      const claimed = await db
        .update(platformRunnerDeviceLogins)
        .set({ state: "collected", collectedAt: now })
        .where(and(eq(platformRunnerDeviceLogins.id, login.id), eq(platformRunnerDeviceLogins.state, "approved")))
        .returning({ id: platformRunnerDeviceLogins.id });
      if (claimed.length === 0) {
        await dropCliAccess();
        return { kind: "missing" };
      }
      const cliAccess = login.cliScope && cliRow ? { id: cliRow.id, name: cliName, scope: login.cliScope } : null;
      return { kind: "collected", accountId: tenantId, runnerRows, cliAccess };
    },
    catch: toDbError,
  }).pipe(
    Effect.flatMap((attempt): Effect.Effect<LoginCollection, DbError> => {
      if (attempt.kind !== "collected") return Effect.succeed(attempt);
      return Effect.tryPromise({
        try: () => db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, attempt.accountId)),
        catch: toDbError,
      }).pipe(
        Effect.map(([tenant]): LoginCollection => ({
          kind: "collected",
          accountId: attempt.accountId,
          accountName: tenant?.name ?? "",
          runner: attempt.runnerRows[0]
            ? {
                runnerId: attempt.runnerRows[0].id,
                name: attempt.runnerRows[0].name,
                accountId: attempt.accountId,
                accountName: tenant?.name ?? "",
              }
            : null,
          cliAccess: attempt.cliAccess,
        })),
      );
    }),
  );

// -----
// Denying is one UPDATE that matches only a login that is pending
// and unexpired, like approving, so it cannot undo an approval. Run
// it in the Account's transaction: null means no live login, and
// the caller fails. It writes one Audit trail entry there, with the
// same fields as the approval and the login as its subject.
// -----
export const denyLoginEffect = (
  db: AppDbType,
  denial: RunnerLoginDenial,
): Effect.Effect<{ loginId: string } | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const deniedBy = await actorPartyOf(db, denial.actorUserId);
      if (!deniedBy) return null;
      const [login] = await db
        .update(platformRunnerDeviceLogins)
        .set({ state: "denied", tenantId: denial.tenantId })
        .where(
          and(
            eq(platformRunnerDeviceLogins.userCodeHash, denial.userCodeHash),
            eq(platformRunnerDeviceLogins.state, "pending"),
            gt(platformRunnerDeviceLogins.expiresAt, denial.now),
          ),
        )
        .returning({
          id: platformRunnerDeviceLogins.id,
          suggestedName: platformRunnerDeviceLogins.suggestedName,
          requestIp: platformRunnerDeviceLogins.requestIp,
        });
      if (!login) return null;
      await insertAuditEntry(db, {
        actorPartyId: deniedBy,
        action: "runner.login.deny",
        subjectId: login.id,
        tenantId: denial.tenantId,
        after: { name: login.suggestedName, requestIp: login.requestIp, approverIp: denial.approverIp },
      });
      return { loginId: login.id };
    },
    catch: toDbError,
  });

// -----
// Deletes logins past their expiry, at most `limit` a call. First the
// Runner rows that approvals made and nobody collected (a Runner with
// a token is never touched; deleting the row also deletes its login),
// then the rest.
// -----
export const deleteExpiredLoginsEffect = (db: DbConnectType, now: Date, limit: number): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const uncollected = await db
        .select({ runnerId: platformRunnerDeviceLogins.runnerId })
        .from(platformRunnerDeviceLogins)
        .where(and(lte(platformRunnerDeviceLogins.expiresAt, now), eq(platformRunnerDeviceLogins.state, "approved")))
        .limit(limit);
      const runnerIds = uncollected.flatMap((row) => (row.runnerId ? [row.runnerId] : []));
      if (runnerIds.length > 0)
        await db
          .delete(tenantRunners)
          .where(and(inArray(tenantRunners.id, runnerIds), isNull(tenantRunners.tokenHash)));
      const expired = await db
        .select({ id: platformRunnerDeviceLogins.id })
        .from(platformRunnerDeviceLogins)
        .where(lte(platformRunnerDeviceLogins.expiresAt, now))
        .limit(limit);
      if (expired.length > 0)
        await db.delete(platformRunnerDeviceLogins).where(
          inArray(
            platformRunnerDeviceLogins.id,
            expired.map((row) => row.id),
          ),
        );
    },
    catch: toDbError,
  });
