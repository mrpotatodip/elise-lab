import { and, asc, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import type { Signal, SignalsSettings } from "@repo/contracts/elise";
import { scanRepos, scanSignals, tenants } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { actorPartyOf, insertAuditEntry } from "#/modules/audit-trail";
import { repoIdentityOf, sameRepoIdentity } from "#/modules/scan-ledger";

export const findSignalsSettingsEffect = (db: AppDbType, tenantId: string): Effect.Effect<SignalsSettings, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db.select({ enabled: tenants.signalsEnabled }).from(tenants).where(eq(tenants.id, tenantId));
      return { enabled: row?.enabled ?? true };
    },
    catch: toDbError,
  });

export const setSignalsEnabledEffect = (db: AppDbType, tenantId: string, userId: string, enabled: boolean): Effect.Effect<SignalsSettings, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const actorPartyId = await actorPartyOf(db, userId);
      const [before] = await db.select({ enabled: tenants.signalsEnabled }).from(tenants).where(eq(tenants.id, tenantId));
      await db.update(tenants).set({ signalsEnabled: enabled }).where(eq(tenants.id, tenantId));
      await insertAuditEntry(db, {
        actorPartyId,
        action: "signals.switched",
        subjectId: tenantId,
        tenantId,
        before: { enabled: before?.enabled ?? true },
        after: { enabled },
      });
      return { enabled };
    },
    catch: toDbError,
  });

export const listSignalsEffect = (db: AppDbType, tenantId: string, repo: string): Effect.Effect<Signal[], DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [account] = await db.select({ enabled: tenants.signalsEnabled }).from(tenants).where(eq(tenants.id, tenantId));
      if (account?.enabled === false) return [];
      const repoIds = db.select({ id: scanRepos.id }).from(scanRepos).where(sameRepoIdentity(tenantId, repoIdentityOf(repo)));
      const rows = await db
        .select()
        .from(scanSignals)
        .where(and(eq(scanSignals.tenantId, tenantId), isNull(scanSignals.dismissedAt)))
        .orderBy(asc(scanSignals.createdAt), asc(scanSignals.id));
      const wanted = new Set((await repoIds).map((row) => row.id));
      return rows
        .filter((row) => wanted.has(row.repoId))
        .map((row) => ({
          id: row.id,
          kind: row.kind,
          fingerprint: row.fingerprint,
          relatedFingerprint: row.relatedFingerprint,
          probability: row.probability,
          modelVersion: row.modelVersion,
          createdAt: row.createdAt.toISOString(),
        }));
    },
    catch: toDbError,
  });

export const dismissSignalEffect = (db: AppDbType, tenantId: string, signalId: string): Effect.Effect<boolean, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const updated = await db
        .update(scanSignals)
        .set({ dismissedAt: new Date() })
        .where(and(eq(scanSignals.id, signalId), eq(scanSignals.tenantId, tenantId), isNull(scanSignals.dismissedAt)))
        .returning({ id: scanSignals.id });
      return updated.length > 0;
    },
    catch: toDbError,
  });
