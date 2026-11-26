import { Effect } from "effect";
import type { ProfileMetValue, ScanUsage } from "@repo/contracts/elise";
import { toExternalError, toParseError, type ExternalError, type ParseError } from "#/lib/effect-query";
import type { ScanParams, ScanState } from "#/schemas";
import { readScanFileEffect, scanKey } from "#/modules/scan-store";
import {
  SCAN_RECORDS_FINDINGS_FILE,
  SCAN_RECORDS_LEDGER_FILE,
  SCAN_RECORDS_METADATA_FILE,
  SCAN_RECORDS_PROFILE_SKILL,
  SCAN_RECORDS_REPORT_FILE,
} from "#/modules/scan-records/constants";
import { FullFindingsSchema, type FullFinding } from "#/modules/scan-records/schemas";
import type { NewFindingRow, ScanBranch, ScanRecord } from "#/modules/scan-records/types";
import { checkRunnerProfile, fullFindingRowOf, isPartialScan, profileMetOf } from "#/modules/scan-records/utils";

const readText = (reports: R2Bucket, params: ScanParams, file: string): Effect.Effect<string | null, ExternalError> =>
  Effect.gen(function* () {
    const object = yield* readScanFileEffect(reports, scanKey(params.accountId, params.scanId, file));
    return object ? yield* Effect.tryPromise({ try: () => object.text(), catch: toExternalError }) : null;
  });

// -----
// A succeeded full Scan: the nested records, one row for each
// confirmed or needs_validation one (the skill's validator
// gives each fingerprint one record; a repeat is dropped so
// the unique index cannot fail the whole record), whether
// money ran out, and, for a Scan that ran on a Runner, the
// profile it met (null for a cloud Scan and a Partial Scan).
// -----
const readProfileScan = (
  reports: R2Bucket,
  params: ScanParams,
): Effect.Effect<
  { findings: NewFindingRow[]; partial: boolean; profileMet: ProfileMetValue | null },
  ExternalError | ParseError
> =>
  Effect.gen(function* () {
    const findingsText = yield* readText(reports, params, SCAN_RECORDS_FINDINGS_FILE);
    const records =
      findingsText === null
        ? []
        : yield* Effect.try({ try: () => FullFindingsSchema.parse(JSON.parse(findingsText)), catch: toParseError });
    const kept = new Map<string, FullFinding>();
    for (const record of records)
      if (record.verdict !== "rejected" && !kept.has(record.fingerprint)) kept.set(record.fingerprint, record);
    const findings = yield* Effect.tryPromise({
      try: () => Promise.all([...kept.values()].map((record) => fullFindingRowOf(record, params))),
      catch: toExternalError,
    });
    const report = yield* readText(reports, params, SCAN_RECORDS_REPORT_FILE);
    const ledger = yield* readText(reports, params, SCAN_RECORDS_LEDGER_FILE);
    const metadata = yield* readText(reports, params, SCAN_RECORDS_METADATA_FILE);
    const scoped = (params.options.scopePaths?.length ?? 0) > 0;
    const check =
      params.runnerId && !scoped
        ? checkRunnerProfile(params.options.profile, { report, ledger, metadata, findings: findingsText })
        : null;
    return {
      findings,
      partial: scoped || isPartialScan(report, ledger, metadata),
      profileMet: profileMetOf(params.options.profile, check),
    };
  });

export const buildScanRecordSvc = (
  reports: R2Bucket,
  params: ScanParams,
  repoId: string,
  branch: ScanBranch,
  status: ScanState,
  error: string | null,
  usage: ScanUsage | null,
): Effect.Effect<ScanRecord, ExternalError | ParseError> =>
  Effect.gen(function* () {
    // -----
    // A succeeded Scan records its findings, its partial flag and,
    // on a Runner, the profile it met. A failed Scan saw nothing.
    // No Scan writes the History or gets Prior findings: its rows
    // are frozen. A Scan of the older Skill is no longer started,
    // so its findings are not read here.
    // -----
    const profile =
      status === "succeeded" && params.options.skill === SCAN_RECORDS_PROFILE_SKILL
        ? yield* readProfileScan(reports, params)
        : null;
    return {
      scan: {
        id: params.scanId,
        tenantId: params.accountId,
        repo: params.repo,
        repoId,
        ref: params.ref ?? null,
        branch: branch.name,
        branchId: branch.id,
        untrackedReason: branch.id ? null : branch.reason,
        partial: profile?.partial ?? null,
        profileMet: profile?.profileMet ?? null,
        status,
        skill: params.options.skill,
        model: params.options.model,
        effort: params.options.effort,
        profile: params.options.profile,
        maxBudgetUsd: params.options.maxBudgetUsd.toFixed(2),
        error,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        cacheReadTokens: usage?.cacheReadTokens ?? null,
        cacheWriteTokens: usage?.cacheWriteTokens ?? null,
        costUsd: usage ? usage.costUsd.toFixed(4) : null,
        turns: usage?.turns ?? null,
        durationMs: usage?.durationMs ?? null,
        createdAt: new Date(params.createdAt),
        finishedAt: status === "succeeded" || status === "failed" ? new Date() : null,
      },
      findings: profile ? profile.findings : [],
    };
  });
