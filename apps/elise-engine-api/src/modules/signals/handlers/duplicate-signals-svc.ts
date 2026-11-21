import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { scanSignals, scans, tenants } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, toExternalError, type DbError, type ExternalError } from "#/lib/effect-query";
import { repoFindingsEffect } from "#/modules/repos/queries";
import { isUnresolved } from "#/modules/repos/utils";
import { SCAN_RECORDS_FULL_CLASS } from "#/modules/scan-records/constants";
import { SIGNAL_DUPLICATE_PAIR_CAP, SIGNAL_DUPLICATE_QUESTION, SIGNAL_KIND_POSSIBLE_DUPLICATE, SIGNAL_YES_THRESHOLD } from "#/modules/signals/constants";
import { duplicatePairKey, duplicatePairsOf } from "#/modules/signals/utils";
import type { TypeSafeGateway } from "#/modules/typesafe";

const withoutPlaceholderClass = <T extends { class: string }>(finding: T) => ({ ...finding, class: finding.class === SCAN_RECORDS_FULL_CLASS ? null : finding.class });

const textOf = (finding: { title: string; class: string | null; file: string | null; impact: string | null; evidence: string | null }) => ({
  title: finding.title,
  class: finding.class,
  file: finding.file,
  impact: finding.impact,
  evidence: finding.evidence,
});

const pairNotChecked = (cause: DbError | ExternalError) => Effect.sync(() => console.error("signals: a possible-duplicate pair was not checked", cause)).pipe(Effect.as(false));

export const detectDuplicateSignalsSvc = (
  db: AppDbType,
  gateway: TypeSafeGateway | null,
  accountId: string,
  scanId: string,
): Effect.Effect<void, DbError | ExternalError> =>
  Effect.gen(function* () {
    if (gateway === null) return;
    const { scan, enabled } = yield* Effect.tryPromise({
      try: async () => {
        const [row] = await db.select().from(scans).where(and(eq(scans.tenantId, accountId), eq(scans.id, scanId)));
        const [account] = await db.select({ enabled: tenants.signalsEnabled }).from(tenants).where(eq(tenants.id, accountId));
        return { scan: row, enabled: account?.enabled ?? true };
      },
      catch: toDbError,
    });
    if (!enabled || !scan || scan.status !== "succeeded" || scan.branchId === null) return;
    const { branchId, repoId } = scan;
    const findings = (yield* repoFindingsEffect(db, accountId, branchId)).get(branchId) ?? [];
    const open = findings.filter(isUnresolved).map(withoutPlaceholderClass);
    const fresh = open.filter((finding) => finding.firstSeenScanId === scanId);
    const stored = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ a: scanSignals.fingerprint, b: scanSignals.relatedFingerprint })
          .from(scanSignals)
          .where(and(eq(scanSignals.tenantId, accountId), eq(scanSignals.repoId, repoId), eq(scanSignals.kind, SIGNAL_KIND_POSSIBLE_DUPLICATE))),
      catch: toDbError,
    });
    const known = new Set(stored.flatMap((row) => (row.b === null ? [] : [duplicatePairKey(row.a, row.b)])));
    const { asked, skipped } = duplicatePairsOf(fresh, open, known, SIGNAL_DUPLICATE_PAIR_CAP);
    yield* Effect.tryPromise({
      try: () => db.update(scans).set({ signalPairsSkipped: skipped }).where(and(eq(scans.tenantId, accountId), eq(scans.id, scanId))),
      catch: toDbError,
    });
    const byFingerprint = new Map(open.map((finding) => [finding.fingerprint, finding]));
    let failed = 0;
    for (const pair of asked) {
      const a = byFingerprint.get(pair.fingerprint);
      const b = byFingerprint.get(pair.other);
      if (!a || !b) continue;
      const checked = yield* Effect.gen(function* () {
        const answer = yield* Effect.tryPromise({
          try: () => gateway.noul({ state: { a: textOf(a), b: textOf(b) }, question: SIGNAL_DUPLICATE_QUESTION }),
          catch: toExternalError,
        });
        if (answer.probability < SIGNAL_YES_THRESHOLD) return;
        yield* Effect.tryPromise({
          try: () =>
            db.insert(scanSignals).values({
              tenantId: accountId,
              repoId,
              fingerprint: pair.fingerprint,
              relatedFingerprint: pair.other,
              kind: SIGNAL_KIND_POSSIBLE_DUPLICATE,
              probability: answer.probability,
              modelVersion: answer.modelVersion,
            }),
          catch: toDbError,
        });
      }).pipe(
        Effect.as(true),
        Effect.catchTags({ DbError: pairNotChecked, ExternalError: pairNotChecked }),
      );
      if (!checked) failed += 1;
    }
    if (failed > 0) {
      yield* Effect.tryPromise({
        try: () => db.update(scans).set({ signalPairsSkipped: skipped + failed }).where(and(eq(scans.tenantId, accountId), eq(scans.id, scanId))),
        catch: toDbError,
      });
    }
  });
