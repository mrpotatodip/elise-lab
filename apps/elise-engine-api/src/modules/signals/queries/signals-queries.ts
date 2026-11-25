import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { WEAK_REASON_SIGNAL_KIND, type CheckAcceptedRiskBody, type Signal, type SignalsSettings } from "@repo/contracts/elise";
import { scanFindings, scanRepos, scanSignals, scans, tenants } from "@repo/db-elise/schema";
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
      const repoIds = db.select({ id: scanRepos.id }).from(scanRepos).where(and(sameRepoIdentity(tenantId, repoIdentityOf(repo)), isNull(scanRepos.removedAt)));
      const rows = await db
        .select()
        .from(scanSignals)
        .where(and(eq(scanSignals.tenantId, tenantId), inArray(scanSignals.repoId, repoIds), isNull(scanSignals.dismissedAt)))
        .orderBy(asc(scanSignals.createdAt), asc(scanSignals.id));
      return rows.map((row) => ({
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

export type ReasonCheckInput = {
  enabled: boolean;
  finding: { repoId: string; title: string; description: string | null; severity: string | null; evidence: string | null } | null;
};

export const findReasonCheckInputEffect = (db: AppDbType, tenantId: string, body: CheckAcceptedRiskBody): Effect.Effect<ReasonCheckInput, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [account] = await db.select({ enabled: tenants.signalsEnabled }).from(tenants).where(eq(tenants.id, tenantId));
      if (account?.enabled === false) return { enabled: false, finding: null };
      const [row] = await db
        .select({ repoId: scans.repoId, title: scanFindings.title, description: scanFindings.impact, severity: scanFindings.severity, evidence: scanFindings.evidence })
        .from(scanFindings)
        .innerJoin(scans, eq(scans.id, scanFindings.scanId))
        .innerJoin(scanRepos, eq(scanRepos.id, scans.repoId))
        .where(and(eq(scanFindings.tenantId, tenantId), sameRepoIdentity(tenantId, repoIdentityOf(body.repo)), isNull(scanRepos.removedAt), eq(scanFindings.fingerprint, body.fingerprint)))
        .orderBy(desc(scanFindings.createdAt))
        .limit(1);
      return { enabled: true, finding: row ?? null };
    },
    catch: toDbError,
  });

export const insertWeakReasonSignalEffect = (
  db: AppDbType,
  tenantId: string,
  repoId: string,
  fingerprint: string,
  answer: { probability: number; modelVersion: string },
): Effect.Effect<Signal, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const same = and(eq(scanSignals.tenantId, tenantId), eq(scanSignals.repoId, repoId), eq(scanSignals.fingerprint, fingerprint), eq(scanSignals.kind, WEAK_REASON_SIGNAL_KIND));
      const [existing] = await db.select({ id: scanSignals.id }).from(scanSignals).where(same).orderBy(desc(scanSignals.createdAt)).limit(1);
      const fields = { probability: answer.probability, modelVersion: answer.modelVersion, dismissedAt: new Date() };
      const [row] = existing
        ? await db.update(scanSignals).set(fields).where(eq(scanSignals.id, existing.id)).returning()
        : await db
            .insert(scanSignals)
            .values({ tenantId, repoId, fingerprint, relatedFingerprint: null, kind: WEAK_REASON_SIGNAL_KIND, ...fields })
            .returning();
      return {
        id: row.id,
        kind: row.kind,
        fingerprint: row.fingerprint,
        relatedFingerprint: row.relatedFingerprint,
        probability: row.probability,
        modelVersion: row.modelVersion,
        createdAt: row.createdAt.toISOString(),
      };
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
