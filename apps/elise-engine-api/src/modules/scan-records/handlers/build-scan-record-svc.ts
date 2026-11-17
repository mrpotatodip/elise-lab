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
  SCAN_RECORDS_RECHECK_FILE,
  SCAN_RECORDS_RECORDED_SKILL,
  SCAN_RECORDS_REPORT_FILE,
} from "#/modules/scan-records/constants";
import { FullFindingsSchema, LiteFindingsSchema, RecheckSchema, type FullFinding, type LiteFinding, type Recheck } from "#/modules/scan-records/schemas";
import type { HistoryContext, NewFindingRow, PlannedFinding, ScanBranch, ScanRecord } from "#/modules/scan-records/types";
import { checkRunnerProfile, fingerprintOf, fullFindingRowOf, isPartialScan, planHistory, profileMetOf } from "#/modules/scan-records/utils";

const NO_HISTORY: HistoryContext = { history: new Map(), triage: new Map(), given: [] };

// -----
// The planner stamps every row with a branch. A scan with no
// branch writes no History rows, so this id never reaches the
// database.
// -----
const UNUSED_BRANCH_ID = "00000000-0000-0000-0000-000000000000";

const readFindings = (
  reports: R2Bucket,
  params: ScanParams,
): Effect.Effect<LiteFinding[], ExternalError | ParseError> =>
  Effect.gen(function* () {
    const object = yield* readScanFileEffect(reports, scanKey(params.accountId, params.scanId, SCAN_RECORDS_FINDINGS_FILE));
    if (!object) return [];
    const text = yield* Effect.tryPromise({ try: () => object.text(), catch: toExternalError });
    return yield* Effect.try({ try: () => LiteFindingsSchema.parse(JSON.parse(text)), catch: toParseError });
  });

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
): Effect.Effect<{ findings: NewFindingRow[]; partial: boolean; profileMet: ProfileMetValue | null }, ExternalError | ParseError> =>
  Effect.gen(function* () {
    const findingsText = yield* readText(reports, params, SCAN_RECORDS_FINDINGS_FILE);
    const records = findingsText === null ? [] : yield* Effect.try({ try: () => FullFindingsSchema.parse(JSON.parse(findingsText)), catch: toParseError });
    const kept = new Map<string, FullFinding>();
    for (const record of records) if (record.verdict !== "rejected" && !kept.has(record.fingerprint)) kept.set(record.fingerprint, record);
    const findings = yield* Effect.tryPromise({ try: () => Promise.all([...kept.values()].map((record) => fullFindingRowOf(record, params))), catch: toExternalError });
    const report = yield* readText(reports, params, SCAN_RECORDS_REPORT_FILE);
    const ledger = yield* readText(reports, params, SCAN_RECORDS_LEDGER_FILE);
    const metadata = yield* readText(reports, params, SCAN_RECORDS_METADATA_FILE);
    const check = params.runnerId ? checkRunnerProfile(params.options.profile, { report, ledger, metadata, findings: findingsText }) : null;
    return { findings, partial: isPartialScan(report, ledger, metadata), profileMet: profileMetOf(params.options.profile, check) };
  });

// -----
// A missing or unreadable recheck.json means the agent
// answered nothing: every prior stays open and unchecked.
// -----
const readRecheck = (reports: R2Bucket, params: ScanParams): Effect.Effect<Recheck, ExternalError> =>
  Effect.gen(function* () {
    const object = yield* readScanFileEffect(reports, scanKey(params.accountId, params.scanId, SCAN_RECORDS_RECHECK_FILE));
    if (!object) return [];
    const text = yield* Effect.tryPromise({ try: () => object.text(), catch: toExternalError });
    return yield* Effect.try({ try: () => RecheckSchema.parse(JSON.parse(text)), catch: toParseError }).pipe(Effect.orElseSucceed((): Recheck => []));
  });

const toRow = ({ finding, fingerprint, origin }: PlannedFinding, params: ScanParams): NewFindingRow => ({
  origin,
  tenantId: params.accountId,
  scanId: params.scanId,
  findingId: finding.id,
  fingerprint,
  status: finding.status,
  severity: finding.status === "confirmed" ? finding.severity : null,
  title: finding.title,
  class: finding.class,
  file: finding.location[0]?.file ?? null,
  line: finding.location[0]?.line ?? null,
  actor: finding.actor ?? null,
  impact: finding.impact ?? null,
  evidence: finding.evidence ?? null,
  fix: finding.fix ?? null,
  needs: finding.needs ?? null,
});

export const buildScanRecordSvc = (
  reports: R2Bucket,
  params: ScanParams,
  repoId: string,
  branch: ScanBranch,
  status: ScanState,
  error: string | null,
  usage: ScanUsage | null,
  context: HistoryContext,
): Effect.Effect<ScanRecord, ExternalError | ParseError> =>
  Effect.gen(function* () {
    // -----
    // A scan that failed, or of a skill whose findings are
    // not recorded, saw nothing. A scan with no tracked branch
    // (a tag, a commit, an untracked name) records its findings
    // but must not move any History: its checkout is not the
    // code a History is about.
    // -----
    const recordsFindings = status === "succeeded" && params.options.skill === SCAN_RECORDS_RECORDED_SKILL;
    // -----
    // A succeeded full Scan records its findings and its partial
    // flag too, but writes no History row and gets no priors:
    // the History is frozen at the end of the lite era.
    // -----
    const profile = status === "succeeded" && params.options.skill === SCAN_RECORDS_PROFILE_SKILL ? yield* readProfileScan(reports, params) : null;
    const movesHistory = recordsFindings && branch.id !== null;
    const found = recordsFindings ? yield* readFindings(reports, params) : [];
    const fingerprints = yield* Effect.tryPromise({
      try: () => Promise.all(found.map((finding) => fingerprintOf(finding.class, finding.location[0]?.file ?? null, finding.title))),
      catch: toExternalError,
    });
    const recheck = movesHistory ? yield* readRecheck(reports, params) : [];
    const plan = planHistory({
      scanId: params.scanId,
      repoId,
      branchId: branch.id ?? UNUSED_BRANCH_ID,
      tenantId: params.accountId,
      ...(movesHistory ? context : NO_HISTORY),
      found: found.map((finding, index) => ({ finding, fingerprint: fingerprints[index] })),
      recheck,
    });
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
        priorsGiven: movesHistory ? plan.tally.given : null,
        priorsCarried: movesHistory ? plan.tally.carried : null,
        priorsClosed: movesHistory ? plan.tally.closed : null,
        priorsUnchecked: movesHistory ? plan.tally.unchecked : null,
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
      findings: profile ? profile.findings : plan.findings.map((item) => toRow(item, params)),
      history: movesHistory ? plan.history : [],
    };
  });
