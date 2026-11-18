import { z } from "zod";
import {
  RUNNER_JOB_ERROR_MAX,
  RUNNER_JOB_FILE_MAX,
  RUNNER_JOB_LOG_MAX,
  RUNNER_JOB_SOURCE_NAME_MAX,
  RUNNER_JOB_SOURCES_MAX,
  RUNNER_LOGIN_DEVICE_CODE_MAX,
  RUNNER_LOGIN_FIELD_MAX,
  RUNNER_LOGIN_USER_CODE_MAX,
  RUNNER_NAME_MAX,
  RUNNER_PAIRING_CODE_MAX,
} from "../constants";
import { RUNNER_JOB_PHASE_VALUES, type RunnerJobSourceValue } from "../enums";
import { SCAN_PROFILES } from "../scan/dto";

export const RunnerIdSchema = z.uuid();

export const CreateRunnerBodySchema = z.object({
  name: z.string().trim().min(1).max(RUNNER_NAME_MAX),
});

export const EnrollRunnerBodySchema = z.object({
  code: z.string().trim().min(1).max(RUNNER_PAIRING_CODE_MAX),
});

export const CreatedRunnerSchema = z.object({
  id: RunnerIdSchema,
  name: z.string(),
  pairingCode: z.string(),
  expiresAt: z.iso.datetime(),
});

export const RunnerIdentitySchema = z.object({
  runnerId: RunnerIdSchema,
  name: z.string(),
  accountId: z.uuid(),
  accountName: z.string(),
});

export const EnrolledRunnerSchema = RunnerIdentitySchema.extend({
  token: z.string(),
});

export const RunnerDisconnectedSchema = z.object({
  disconnected: z.literal(true),
});

export const RunnerParamSchema = z.object({
  runnerId: RunnerIdSchema,
});

// -----
// waiting: a pairing code was made and has not been used or expired.
// expired: the code ran out before the computer paired.
// connected: a computer paired and has not been removed.
// A removed Runner is not listed.
// -----
export const RunnerStateSchema = z.enum(["waiting", "expired", "connected"]);

export const RunnerSchema = z.object({
  id: RunnerIdSchema,
  name: z.string(),
  state: RunnerStateSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  pairedAt: z.iso.datetime().nullable(),
  lastSeenAt: z.iso.datetime().nullable(),
  createdByName: z.string().nullable().optional(),
});

export const RunnersSchema = z.array(RunnerSchema);

export const RunnerRemovedSchema = z.object({
  removed: z.literal(true),
});

// -----
// A Scan for a Runner to run. The Runner clones repo at ref (the
// default branch when null), puts priorsJson in prior-findings.json
// when it is not empty (the Worker now always sends ""), and gives
// the agent the prompt. The Worker
// builds the prompt, so the audit's words stay in one place.
// profile and profileCapUsd are the Scan's profile and the cap the
// profile has in the Worker's table, for a Runner app that runs the
// full Skill. Both are optional: an old Worker sends neither, and an
// old app ignores them. maxBudgetUsd stays the Runner's own ceiling,
// and the Runner takes no credit.
// phasePrompts are the four Phase prompts in order, each with its Phase
// name, built for a Runner's place when the job is claimed. An app that
// knows Phases runs them one after the other; an older app ignores the
// field and runs prompt. Optional: an older Worker sends none, and then
// a newer app runs prompt.
// -----
export const RunnerPhasePromptSchema = z.object({
  phase: z.enum(RUNNER_JOB_PHASE_VALUES),
  prompt: z.string(),
});

// -----
// What a job reads. git: clone repo at ref. archive: download the
// uploaded zip with this id, which the Worker serves only to the
// Runner that claimed the job. A job without a source is git: an
// older Worker sends none. An archive job goes only to a Runner
// whose claim listed archive in its sources.
// -----
export const RunnerJobSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("git" satisfies RunnerJobSourceValue) }),
  z.object({ kind: z.literal("archive" satisfies RunnerJobSourceValue), archiveId: z.uuid() }),
]);

// -----
// What a Runner sends when it asks for a job: the job sources it
// can read. An older Runner sends no body, which reads as git
// only. A name this Worker does not know is ignored, not refused,
// so a newer Runner still gets its jobs.
// -----
export const RunnerClaimBodySchema = z.object({
  sources: z.array(z.string().max(RUNNER_JOB_SOURCE_NAME_MAX)).max(RUNNER_JOB_SOURCES_MAX).optional(),
});

export const RunnerJobSchema = z.object({
  scanId: z.string(),
  repo: z.string(),
  source: RunnerJobSourceSchema.optional(),
  ref: z.string().nullable(),
  skill: z.string(),
  model: z.string(),
  effort: z.string(),
  profile: z.enum(SCAN_PROFILES).optional(),
  profileCapUsd: z.number().positive().optional(),
  maxBudgetUsd: z.number().positive(),
  prompt: z.string(),
  phasePrompts: z.array(RunnerPhasePromptSchema).optional(),
  priorsJson: z.string(),
});

// -----
// What the Runner reports when the agent ends. checkout is what git
// said about the clone: the commit, the branch HEAD was on, and
// whether the ref was fetched as a branch or as something else.
// files holds the deliverables by name; agentLog is the agent's
// own final JSON report, which carries the usage.
// -----
export const RunnerJobResultBodySchema = z.object({
  state: z.enum(["succeeded", "failed"]),
  error: z.string().max(RUNNER_JOB_ERROR_MAX).nullable().optional(),
  checkout: z
    .object({
      commitSha: z.string().nullable(),
      headBranch: z.string().nullable(),
      kind: z.enum(["branch", "other"]).nullable(),
    })
    .nullable()
    .optional(),
  agentLog: z.string().max(RUNNER_JOB_LOG_MAX).nullable().optional(),
  files: z.record(z.string().regex(/^[\w.-]{1,80}$/), z.string().max(RUNNER_JOB_FILE_MAX)).optional(),
});

export const RunnerJobParamSchema = z.object({
  scanId: z.string().regex(/^[\w-]{1,100}$/),
});

export const RunnerJobReportedSchema = z.object({
  accepted: z.literal(true),
});

export const StartRunnerLoginBodySchema = z.object({
  name: z.string().trim().min(1).max(RUNNER_NAME_MAX),
  os: z.string().trim().min(1).max(RUNNER_LOGIN_FIELD_MAX),
  cpu: z.string().trim().min(1).max(RUNNER_LOGIN_FIELD_MAX),
  version: z.string().trim().min(1).max(RUNNER_LOGIN_FIELD_MAX),
});

export const StartedRunnerLoginSchema = z.object({
  userCode: z.string(),
  verificationUrl: z.url(),
  deviceCode: z.string(),
  expiresAt: z.iso.datetime(),
});

export const ApproveRunnerLoginBodySchema = z.object({
  userCode: z.string().trim().min(1).max(RUNNER_LOGIN_USER_CODE_MAX),
  name: z.string().trim().min(1).max(RUNNER_NAME_MAX),
});

export const ApprovedRunnerLoginSchema = z.object({
  approved: z.literal(true),
  runnerId: RunnerIdSchema,
});

export const RunnerLoginLookupQuerySchema = z.object({
  code: z.string().trim().min(1).max(RUNNER_LOGIN_USER_CODE_MAX),
});

export const PendingRunnerLoginSchema = z.object({
  suggestedName: z.string(),
  os: z.string(),
  cpu: z.string(),
  version: z.string(),
  requestIp: z.string(),
  expiresAt: z.iso.datetime(),
});

export const CheckRunnerLoginBodySchema = z.object({
  deviceCode: z.string().trim().min(1).max(RUNNER_LOGIN_DEVICE_CODE_MAX),
});

export const RunnerLoginCheckSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  EnrolledRunnerSchema.extend({ status: z.literal("approved") }),
  z.object({ status: z.literal("denied") }),
  z.object({ status: z.literal("expired") }),
  z.object({ status: z.literal("slow_down"), interval: z.number().int().positive() }),
]);

export const DenyRunnerLoginBodySchema = z.object({
  userCode: z.string().trim().min(1).max(RUNNER_LOGIN_USER_CODE_MAX),
});

export const DeniedRunnerLoginSchema = z.object({
  denied: z.literal(true),
});

export type CreateRunnerBody = z.infer<typeof CreateRunnerBodySchema>;
export type EnrollRunnerBody = z.infer<typeof EnrollRunnerBodySchema>;
export type CreatedRunner = z.infer<typeof CreatedRunnerSchema>;
export type RunnerIdentity = z.infer<typeof RunnerIdentitySchema>;
export type EnrolledRunner = z.infer<typeof EnrolledRunnerSchema>;
export type RunnerState = z.infer<typeof RunnerStateSchema>;
export type Runner = z.infer<typeof RunnerSchema>;
export type Runners = z.infer<typeof RunnersSchema>;
export type RunnerPhasePrompt = z.infer<typeof RunnerPhasePromptSchema>;
export type RunnerJobSource = z.infer<typeof RunnerJobSourceSchema>;
export type RunnerJob = z.infer<typeof RunnerJobSchema>;
export type RunnerClaimBody = z.infer<typeof RunnerClaimBodySchema>;
export type RunnerJobResultBody = z.infer<typeof RunnerJobResultBodySchema>;
export type StartRunnerLoginBody = z.infer<typeof StartRunnerLoginBodySchema>;
export type StartedRunnerLogin = z.infer<typeof StartedRunnerLoginSchema>;
export type ApproveRunnerLoginBody = z.infer<typeof ApproveRunnerLoginBodySchema>;
export type ApprovedRunnerLogin = z.infer<typeof ApprovedRunnerLoginSchema>;
export type RunnerLoginLookupQuery = z.infer<typeof RunnerLoginLookupQuerySchema>;
export type PendingRunnerLogin = z.infer<typeof PendingRunnerLoginSchema>;
export type CheckRunnerLoginBody = z.infer<typeof CheckRunnerLoginBodySchema>;
export type RunnerLoginCheck = z.infer<typeof RunnerLoginCheckSchema>;
export type DenyRunnerLoginBody = z.infer<typeof DenyRunnerLoginBodySchema>;
export type DeniedRunnerLogin = z.infer<typeof DeniedRunnerLoginSchema>;
