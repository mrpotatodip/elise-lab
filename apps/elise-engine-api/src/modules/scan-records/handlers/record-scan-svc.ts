import { Effect } from "effect";
import type { ScanUsage } from "@repo/contracts/elise";
import { dbConnect, type DbConnectType } from "#/lib/db-connection";
import { toExternalError, type DbError, type ExternalError, type ParseError } from "#/lib/effect-query";
import { sealerEffect } from "#/modules/sealed-data";
import { sealFindingRowsSvc } from "./seal-finding-rows-svc";
import type { ScanParams, ScanState } from "#/schemas";
import { resolveScanBranchEffect, type ScanBranchOutcome } from "#/modules/branches";
import { scanRowOfEffect, writeScanRecordEffect } from "#/modules/scan-records/queries";
import type { RecordScanEnv, ScanBranch } from "#/modules/scan-records/types";
import { buildScanRecordSvc } from "./build-scan-record-svc";

// -----
// Every succeeded scan belongs to the branch it read, so the
// branch page lists it. No scan writes the History. A scan that
// was already closed as failed (a newer request expired it)
// writes nothing.
// -----
export const recordScanSvc = (
  env: RecordScanEnv,
  params: ScanParams,
  status: ScanState,
  error: string | null,
  usage: ScanUsage | null,
): Effect.Effect<void, DbError | ExternalError | ParseError> =>
  Effect.gen(function* () {
    if (!env.DATABASE_URL) {
      yield* Effect.sync(() => console.warn("scan records: DATABASE_URL is not set, so the scan is not recorded"));
      return;
    }
    const db = dbConnect(env.DATABASE_URL);
    const {
      repoId,
      status: current,
      branch: branchName,
      ref,
    } = yield* scanRowOfEffect(db, params.accountId, params.scanId);
    if (current === "stopped") {
      yield* Effect.sync(() =>
        console.warn(`scan records: ${params.scanId} was stopped by a person, so its results are not recorded`),
      );
      return;
    }
    if (current === "failed" && status === "succeeded") {
      yield* Effect.sync(() =>
        console.warn(
          `scan records: ${params.scanId} was closed as failed before it finished, so its results are not recorded`,
        ),
      );
      return;
    }
    const succeeded = status === "succeeded";
    const outcome: ScanBranchOutcome = succeeded
      ? yield* resolveScanBranchEffect(db, params.accountId, repoId, { name: branchName, ref })
      : { id: null, reason: null };
    yield* recordSealedScanSvc(
      db,
      env,
      params,
      repoId,
      { ...outcome, name: outcome.name ?? branchName },
      status,
      error,
      usage,
    );
  });

export const recordSealedScanSvc = (
  db: DbConnectType,
  env: Pick<RecordScanEnv, "REPORTS" | "DATA_MASTER_KEY">,
  params: ScanParams,
  repoId: string,
  branch: ScanBranch,
  status: ScanState,
  error: string | null,
  usage: ScanUsage | null,
): Effect.Effect<void, DbError | ExternalError | ParseError> =>
  Effect.gen(function* () {
    const sealer = yield* sealerEffect(db, env.DATA_MASTER_KEY, params.accountId);
    const record = yield* buildScanRecordSvc(env.REPORTS, params, repoId, branch, status, error, usage, sealer.open);
    const findings = yield* sealFindingRowsSvc(db, sealer, params.accountId, repoId, record.findings);
    const sealedError = yield* Effect.tryPromise({
      try: () => sealer.textOrNull(record.scan.error ?? null),
      catch: toExternalError,
    });
    yield* writeScanRecordEffect(db, { scan: { ...record.scan, error: sealedError }, findings });
  });
