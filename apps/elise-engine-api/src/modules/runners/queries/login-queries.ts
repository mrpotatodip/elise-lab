import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { Effect } from "effect";
import { platformRunnerDeviceLogins, tenantRunners } from "@repo/db-elise";
import { RUNNER_LOGIN_SLOW_DOWN_STEP_S, type PendingRunnerLogin, type RunnerIdentity } from "@repo/contracts/elise";
import type { AppDbType, DbConnectType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { actorPartyOf, insertAuditEntry } from "#/modules/audit-trail";
import { identityOrNull } from "./runner-queries";
import type { NewRunnerLogin, RunnerLoginApproval, RunnerLoginDenial } from "#/modules/runners/types";

export type LoginCollection =
  | { kind: "missing" }
  | { kind: "pending" }
  | { kind: "denied" }
  | { kind: "expired" }
  | { kind: "slow_down"; interval: number }
  | { kind: "collected"; identity: RunnerIdentity };

type LoginAttempt = Exclude<LoginCollection, { kind: "collected" }> | { kind: "collected"; rows: { id: string; name: string; tenantId: string }[] };

export const startLoginEffect = (db: DbConnectType, login: NewRunnerLogin): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: () => db.insert(platformRunnerDeviceLogins).values(login),
    catch: toDbError,
  }).pipe(Effect.asVoid);

// -----
// What the approval page shows: only a login that is pending and
// unexpired, and never a hash or the device code.
// -----
export const findPendingLoginEffect = (db: DbConnectType, userCodeHash: string, now: Date): Effect.Effect<PendingRunnerLogin | null, DbError> =>
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
        .where(and(eq(platformRunnerDeviceLogins.userCodeHash, userCodeHash), eq(platformRunnerDeviceLogins.state, "pending"), gt(platformRunnerDeviceLogins.expiresAt, now)));
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
export const approveLoginEffect = (db: AppDbType, approval: RunnerLoginApproval): Effect.Effect<{ runnerId: string } | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const createdBy = await actorPartyOf(db, approval.actorUserId);
      if (!createdBy) return null;
      const [login] = await db
        .update(platformRunnerDeviceLogins)
        .set({ state: "approved", tenantId: approval.tenantId, approvedBy: createdBy, approverIp: approval.approverIp, approvedAt: approval.now })
        .where(
          and(
            eq(platformRunnerDeviceLogins.userCodeHash, approval.userCodeHash),
            eq(platformRunnerDeviceLogins.state, "pending"),
            gt(platformRunnerDeviceLogins.expiresAt, approval.now),
          ),
        )
        .returning({ id: platformRunnerDeviceLogins.id, expiresAt: platformRunnerDeviceLogins.expiresAt, requestIp: platformRunnerDeviceLogins.requestIp });
      if (!login) return null;
      const [runner] = await db
        .insert(tenantRunners)
        .values({ tenantId: approval.tenantId, name: approval.name, pairingExpiresAt: login.expiresAt, createdBy })
        .returning({ id: tenantRunners.id });
      if (!runner) return null;
      await db.update(platformRunnerDeviceLogins).set({ runnerId: runner.id }).where(eq(platformRunnerDeviceLogins.id, login.id));
      await insertAuditEntry(db, {
        actorPartyId: createdBy,
        action: "runner.login.approve",
        subjectId: runner.id,
        tenantId: approval.tenantId,
        after: { name: approval.name, requestIp: login.requestIp, approverIp: approval.approverIp },
      });
      return { runnerId: runner.id };
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
// -----
export const collectLoginEffect = (db: DbConnectType, deviceCodeHash: string, tokenHash: string, now: Date): Effect.Effect<LoginCollection, DbError> =>
  Effect.tryPromise({
    try: async (): Promise<LoginAttempt> => {
      const [login] = await db
        .select({
          id: platformRunnerDeviceLogins.id,
          state: platformRunnerDeviceLogins.state,
          runnerId: platformRunnerDeviceLogins.runnerId,
          expiresAt: platformRunnerDeviceLogins.expiresAt,
          lastCheckedAt: platformRunnerDeviceLogins.lastCheckedAt,
          interval: platformRunnerDeviceLogins.checkIntervalSeconds,
        })
        .from(platformRunnerDeviceLogins)
        .where(eq(platformRunnerDeviceLogins.deviceCodeHash, deviceCodeHash));
      if (!login || login.state === "collected") return { kind: "missing" };
      if (login.expiresAt <= now) {
        if (login.runnerId) {
          await db.update(platformRunnerDeviceLogins).set({ runnerId: null }).where(eq(platformRunnerDeviceLogins.id, login.id));
          await db.delete(tenantRunners).where(and(eq(tenantRunners.id, login.runnerId), isNull(tenantRunners.tokenHash)));
        }
        return { kind: "expired" };
      }
      const tooEarly = login.lastCheckedAt !== null && now.getTime() - login.lastCheckedAt.getTime() < login.interval * 1000;
      const interval = tooEarly ? login.interval + RUNNER_LOGIN_SLOW_DOWN_STEP_S : login.interval;
      await db.update(platformRunnerDeviceLogins).set({ lastCheckedAt: now, checkIntervalSeconds: interval }).where(eq(platformRunnerDeviceLogins.id, login.id));
      if (tooEarly) return { kind: "slow_down", interval };
      if (login.state === "pending") return { kind: "pending" };
      if (login.state === "denied") return { kind: "denied" };
      if (login.state !== "approved" || !login.runnerId) return { kind: "missing" };
      const rows = await db
        .update(tenantRunners)
        .set({ tokenHash, pairingExpiresAt: null, pairedAt: now, lastSeenAt: now })
        .where(and(eq(tenantRunners.id, login.runnerId), isNull(tenantRunners.tokenHash), isNull(tenantRunners.revokedAt)))
        .returning({ id: tenantRunners.id, name: tenantRunners.name, tenantId: tenantRunners.tenantId });
      if (rows.length === 0) return { kind: "missing" };
      await db.update(platformRunnerDeviceLogins).set({ state: "collected", collectedAt: now }).where(eq(platformRunnerDeviceLogins.id, login.id));
      return { kind: "collected", rows };
    },
    catch: toDbError,
  }).pipe(
    Effect.flatMap((attempt): Effect.Effect<LoginCollection, DbError> => {
      if (attempt.kind !== "collected") return Effect.succeed(attempt);
      return identityOrNull(db, attempt.rows).pipe(Effect.map((identity): LoginCollection => (identity ? { kind: "collected", identity } : { kind: "missing" })));
    }),
  );

// -----
// Denying is one UPDATE that matches only a login that is pending
// and unexpired, like approving, so it cannot undo an approval. Run
// it in the Account's transaction: null means no live login, and
// the caller fails. It writes one Audit trail entry there, with the
// same fields as the approval and the login as its subject.
// -----
export const denyLoginEffect = (db: AppDbType, denial: RunnerLoginDenial): Effect.Effect<{ loginId: string } | null, DbError> =>
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
        .returning({ id: platformRunnerDeviceLogins.id, suggestedName: platformRunnerDeviceLogins.suggestedName, requestIp: platformRunnerDeviceLogins.requestIp });
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
      if (runnerIds.length > 0) await db.delete(tenantRunners).where(and(inArray(tenantRunners.id, runnerIds), isNull(tenantRunners.tokenHash)));
      const expired = await db.select({ id: platformRunnerDeviceLogins.id }).from(platformRunnerDeviceLogins).where(lte(platformRunnerDeviceLogins.expiresAt, now)).limit(limit);
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
