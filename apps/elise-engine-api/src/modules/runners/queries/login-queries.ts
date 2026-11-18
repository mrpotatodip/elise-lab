import { and, eq, gt, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { platformRunnerDeviceLogins, tenantRunners } from "@repo/db-elise";
import type { PendingRunnerLogin, RunnerIdentity } from "@repo/contracts/elise";
import type { AppDbType, DbConnectType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { actorPartyOf } from "#/modules/audit-trail";
import { identityOrNull } from "./runner-queries";
import type { NewRunnerLogin, RunnerLoginApproval } from "#/modules/runners/types";

export type LoginCollection = { kind: "missing" } | { kind: "pending" } | { kind: "collected"; identity: RunnerIdentity };

type LoginAttempt = { kind: "missing" } | { kind: "pending" } | { kind: "collected"; rows: { id: string; name: string; tenantId: string }[] };

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
// the caller fails so nothing is kept.
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
        .returning({ id: platformRunnerDeviceLogins.id, expiresAt: platformRunnerDeviceLogins.expiresAt });
      if (!login) return null;
      const [runner] = await db
        .insert(tenantRunners)
        .values({ tenantId: approval.tenantId, name: approval.name, pairingExpiresAt: login.expiresAt, createdBy })
        .returning({ id: tenantRunners.id });
      if (!runner) return null;
      await db.update(platformRunnerDeviceLogins).set({ runnerId: runner.id }).where(eq(platformRunnerDeviceLogins.id, login.id));
      return { runnerId: runner.id };
    },
    catch: toDbError,
  });

// -----
// The Runner's check. A login that is unknown, expired or already
// collected is missing, whatever the reason. After approval the
// token hash is set by one UPDATE that needs no token yet, so two
// checks cannot both collect; the loser is missing too.
// -----
export const collectLoginEffect = (db: DbConnectType, deviceCodeHash: string, tokenHash: string, now: Date): Effect.Effect<LoginCollection, DbError> =>
  Effect.tryPromise({
    try: async (): Promise<LoginAttempt> => {
      const [login] = await db
        .select({ id: platformRunnerDeviceLogins.id, state: platformRunnerDeviceLogins.state, runnerId: platformRunnerDeviceLogins.runnerId })
        .from(platformRunnerDeviceLogins)
        .where(and(eq(platformRunnerDeviceLogins.deviceCodeHash, deviceCodeHash), gt(platformRunnerDeviceLogins.expiresAt, now)));
      if (!login) return { kind: "missing" };
      if (login.state === "pending") return { kind: "pending" };
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
