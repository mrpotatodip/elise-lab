import { Effect } from "effect";
import {
  RUNNER_JOB_SOURCE_VALUES,
  type RunnerJob,
  type RunnerJobResultBody,
  type RunnerJobState,
} from "@repo/contracts/elise";
import { SCAN_KEPT_FILES } from "#/constants";
import type { DbConnectType } from "#/lib/db-connection";
import { NotFound, toExternalError, type DbError, type ExternalError } from "#/lib/effect-query";
import type { ScanFiles } from "#/lib/scan-file-types";
import { ScanOptionsSchema } from "#/schemas";
import { normalizeBranchName } from "#/modules/branches";
import { handoverFilesSvc } from "#/modules/decided-problems";
import { previousMapFilesSvc, type PreviousMapStore } from "#/modules/previous-map";
import { SCAN_SANDBOX_FULL_PHASES, buildPhasePrompt, parseAgentPhases, parseAgentUsage } from "#/modules/scan-sandbox";
import {
  RUNNER_JOB_ARCHIVE_REMOVED,
  RUNNER_JOB_BAD_OPTIONS,
  RUNNER_JOB_NO_REPORT,
  RUNNER_JOB_NOT_FOUND,
  RUNNER_JOB_UNREADABLE,
  RUNNER_PROMPT_PLACE,
} from "#/modules/runners/constants";
import { CANNOT_READ, openJobText, sealerEffect, unsealerEffect, type Sealer } from "#/modules/sealed-data";
import {
  claimRunnerJobEffect,
  earlierScanIdsEffect,
  readRunnerJobEffect,
  recordRunnerSourcesEffect,
  reportRunnerJobEffect,
} from "#/modules/runners/queries";
import { archiveKeyEffect, scanArchiveOfEffect } from "#/modules/archives/queries";
import { sourceProviderOf } from "#/providers/registry";

const UPLOAD_BRANCH = sourceProviderOf("upload").fixedBranch;

// -----
// The Runner takes the next Scan waiting for it, or gets null.
// The job carries the single prompt stored with it and, built
// here from the Scan's stored options, the four Phase prompts: an
// app that knows Phases runs them, an older one runs the prompt.
// Asking also records that the Runner is alive, through the
// authentication that comes before this.
// A job whose options no longer parse, or whose zip was removed
// while it waited, is failed on the spot, so the Scan ends with a
// reason and the Runner moves to the next job instead of meeting
// the same row on every poll.
// The Runner names the job sources it reads; an older one names
// none and reads git only. They are kept on the Runner, so an
// upload Scan can be refused before it is queued, and an archive
// job goes only to a Runner that reads archives.
// -----
export const claimJobSvc = (
  db: DbConnectType,
  runnerId: string,
  reported?: readonly string[],
  previousMaps?: PreviousMapStore,
  masterKey?: string,
): Effect.Effect<RunnerJob | null, DbError | ExternalError> =>
  Effect.gen(function* () {
    const sources = RUNNER_JOB_SOURCE_VALUES.filter((source) => source === "git" || reported?.includes(source));
    yield* recordRunnerSourcesEffect(db, runnerId, sources);
    return yield* claimNextJob(db, runnerId, sources.includes("archive"), previousMaps, masterKey);
  });

const failClaimed = (
  db: DbConnectType,
  sealer: Sealer,
  runnerId: string,
  scanId: string,
  error: string,
  now: Date,
): Effect.Effect<boolean, DbError | ExternalError> =>
  Effect.gen(function* () {
    const sealed = yield* Effect.tryPromise({
      try: async () => ({ error: await sealer.text(error), filesJson: await sealer.text("{}") }),
      catch: toExternalError,
    });
    return yield* reportRunnerJobEffect(db, {
      scanId,
      runnerId,
      state: "failed",
      error: sealed.error,
      commitSha: null,
      branch: null,
      usageJson: null,
      filesJson: sealed.filesJson,
      now,
    });
  });

const claimNextJob = (
  db: DbConnectType,
  runnerId: string,
  readsArchive: boolean,
  previousMaps?: PreviousMapStore,
  masterKey?: string,
): Effect.Effect<RunnerJob | null, DbError | ExternalError> =>
  Effect.gen(function* () {
    const now = new Date();
    const claimed = yield* claimRunnerJobEffect(db, runnerId, now, readsArchive);
    if (claimed === null) return null;
    const sealer = yield* sealerEffect(db, masterKey, claimed.tenantId);
    const unsealer = sealer.open;
    const row = yield* Effect.promise(() => openJobText(unsealer, claimed));
    if (row.prompt === CANNOT_READ || row.priorsJson === CANNOT_READ) {
      yield* failClaimed(db, sealer, runnerId, row.scanId, RUNNER_JOB_UNREADABLE, now);
      return yield* claimNextJob(db, runnerId, readsArchive, previousMaps, masterKey);
    }
    const options = yield* Effect.try(() => ScanOptionsSchema.parse(JSON.parse(row.optionsJson))).pipe(Effect.option);
    if (options._tag === "None") {
      yield* failClaimed(db, sealer, runnerId, row.scanId, RUNNER_JOB_BAD_OPTIONS, now);
      return yield* claimNextJob(db, runnerId, readsArchive, previousMaps, masterKey);
    }
    const archive = yield* scanArchiveOfEffect(db, row.scanId, unsealer);
    if (archive !== null && archive.id === null) {
      yield* failClaimed(db, sealer, runnerId, row.scanId, RUNNER_JOB_ARCHIVE_REMOVED, now);
      return yield* claimNextJob(db, runnerId, readsArchive, previousMaps, masterKey);
    }
    const handoverFiles = [
      ...(yield* handoverFilesSvc(db, row.tenantId, row.repoUrl, row.ref ?? undefined, masterKey)),
      ...(previousMaps === undefined
        ? []
        : yield* previousMapFilesSvc(db, previousMaps, row.tenantId, row.repoUrl, row.ref ?? undefined, masterKey)),
    ];
    const handoverNames = handoverFiles.map((file) => file.name);
    const job: RunnerJob = {
      scanId: row.scanId,
      repo: row.repoUrl,
      source: archive?.id ? { kind: "archive" as const, archiveId: archive.id } : { kind: "git" as const },
      ref: row.ref,
      skill: options.value.skill,
      model: options.value.model,
      effort: options.value.effort,
      profile: options.value.profile,
      profileCapUsd: options.value.maxBudgetUsd,
      maxBudgetUsd: options.value.maxBudgetUsd,
      scopePaths: options.value.scopePaths,
      prompt: row.prompt,
      phasePrompts: SCAN_SANDBOX_FULL_PHASES.map((phase) => ({
        phase,
        prompt: buildPhasePrompt(options.value, phase, RUNNER_PROMPT_PLACE, handoverNames),
      })),
      priorsJson: row.priorsJson,
    };
    if (handoverFiles.length > 0) job.handoverFiles = handoverFiles;
    if (row.resumesScanId !== null) {
      job.resume = true;
      job.resumesScanId = row.resumesScanId;
      job.earlierScanIds = yield* earlierScanIdsEffect(db, row.tenantId, row.resumesScanId);
    }
    return job;
  });

// -----
// The zip of an upload Scan, for the Runner that claimed its job
// and only while that job is claimed. Any other Runner, a job
// that is not claimed, and a git job get the same NotFound, so a
// Runner learns nothing about another's Scans. A zip removed
// since (its link's archive id is null, or the bytes are gone)
// says so.
// -----
export const jobArchiveSvc = (
  db: DbConnectType,
  reports: R2Bucket,
  runnerId: string,
  scanId: string,
  masterKey?: string,
): Effect.Effect<{ body: ReadableStream | ArrayBuffer }, NotFound | DbError | ExternalError> =>
  Effect.gen(function* () {
    const job = yield* readRunnerJobEffect(db, scanId);
    if (job === null || job.runnerId !== runnerId || job.state !== "claimed")
      return yield* new NotFound({ message: RUNNER_JOB_NOT_FOUND });
    const archive = yield* scanArchiveOfEffect(db, scanId);
    if (archive === null) return yield* new NotFound({ message: RUNNER_JOB_NOT_FOUND });
    const key = archive.id === null ? null : yield* archiveKeyEffect(db, archive.id);
    const object =
      key === null ? null : yield* Effect.tryPromise({ try: () => reports.get(key), catch: toExternalError });
    if (object === null) return yield* new NotFound({ message: RUNNER_JOB_ARCHIVE_REMOVED });
    const unsealer = yield* unsealerEffect(db, masterKey, job.tenantId);
    const body = yield* Effect.promise(() => unsealer.object(object));
    if (body === null) return yield* new NotFound({ message: RUNNER_JOB_ARCHIVE_REMOVED });
    return { body };
  });

export const jobStateSvc = (
  db: DbConnectType,
  runnerId: string,
  scanId: string,
): Effect.Effect<RunnerJobState, NotFound | DbError> =>
  Effect.gen(function* () {
    const job = yield* readRunnerJobEffect(db, scanId);
    if (job === null || job.runnerId !== runnerId) return yield* new NotFound({ message: RUNNER_JOB_NOT_FOUND });
    return { state: job.state };
  });

// -----
// Only the names a Scan may keep.
// -----
const keptFiles = (sent: RunnerJobResultBody["files"]): ScanFiles => {
  const kept: ScanFiles = {};
  for (const name of SCAN_KEPT_FILES) {
    const text = sent?.[name];
    if (text !== undefined) kept[name] = text;
  }
  return kept;
};

// -----
// The branch the same way the container works it out: with a ref,
// the ref when git fetched it as a branch; without one, the branch
// HEAD was on.
// -----
const branchOf = (ref: string | null, checkout: RunnerJobResultBody["checkout"]): string | null => {
  if (ref) return checkout?.kind === "branch" ? ref : null;
  return normalizeBranchName(checkout?.headBranch ?? "");
};

// -----
// A succeeded report with no REPORT.md is a failure, as in the
// container. The cost is the agent's own estimate at API prices,
// kept so the person can see what the scan would have cost. It
// carries no markup and is never billed: a Scan on a Runner runs
// on the person's own Claude, takes no credit hold, settles
// nothing, and the month's spend leaves it out.
// -----
export const reportJobSvc = (
  db: DbConnectType,
  runnerId: string,
  scanId: string,
  body: RunnerJobResultBody,
  masterKey?: string,
): Effect.Effect<{ accepted: true }, NotFound | ExternalError | DbError> =>
  Effect.gen(function* () {
    const job = yield* readRunnerJobEffect(db, scanId);
    if (job === null || job.runnerId !== runnerId)
      return yield* Effect.fail(new NotFound({ message: RUNNER_JOB_NOT_FOUND }));

    const files = keptFiles(body.files);
    const succeeded = body.state === "succeeded" && files["REPORT.md"] !== undefined;
    const total = body.agentLog ? parseAgentUsage(body.agentLog) : null;
    const usage = total === null || !body.agentLog ? total : { ...total, phases: parseAgentPhases(body.agentLog) };
    // -----
    // An upload Scan read the zip the server linked it to: its
    // hash is the commit and the app's hidden Branch its Branch,
    // whatever the Runner says, so the zips stay one History.
    // -----
    const archive = yield* scanArchiveOfEffect(db, scanId);
    const sealer = yield* sealerEffect(db, masterKey, job.tenantId);
    const sealed = yield* Effect.tryPromise({
      try: async () => ({
        error: succeeded ? null : await sealer.text(body.error ?? RUNNER_JOB_NO_REPORT),
        filesJson: succeeded ? await sealer.text(JSON.stringify(files)) : null,
      }),
      catch: toExternalError,
    });
    const accepted = yield* reportRunnerJobEffect(db, {
      scanId,
      runnerId,
      state: succeeded ? "succeeded" : "failed",
      error: sealed.error,
      commitSha: archive ? archive.contentSha256 : (body.checkout?.commitSha ?? null),
      branch: archive ? UPLOAD_BRANCH : branchOf(job.ref, body.checkout),
      usageJson: usage === null ? null : JSON.stringify(usage),
      filesJson: sealed.filesJson,
      now: new Date(),
    });
    if (!accepted) return yield* Effect.fail(new NotFound({ message: RUNNER_JOB_NOT_FOUND }));
    return { accepted: true as const };
  });
