import type { Effect } from "effect";
import type { DbError, Invalid } from "#/lib/effect-query";
import type { ScanArchiveLink } from "#/modules/archives/queries";
import type { ScanParams } from "#/schemas";
import type { AppDeps, Bindings } from "#/types/variables";

// -----
// Service inputs
// -----
export type CreateScanEnv = Pick<Bindings, "SCAN_WORKFLOW_FULL" | "MODEL" | "EFFORT" | "MAX_BUDGET_FULL_USD" | "MAX_ACTIVE_SCANS" | "MAX_ACTIVE_FULL_SCANS" | "MONTHLY_BUDGET_USD" | "BUDGET_ALLOWANCE_USD" | "BILLING_ENFORCED">;
export type DetailScanEnv = Pick<Bindings, "SCAN_WORKFLOW_FULL">;
export type SubmitScanDeps = Pick<AppDeps, "scanRepo" | "githubAccess" | "monthSpend" | "holdCredit" | "releaseCredit" | "connectedRunnerSources" | "linkArchive">;

// -----
// The job sources a Runner of the Account last reported (git,
// archive), or null when it has not paired or is removed.
// -----
export type RunnerSources = (runnerId: string) => Effect.Effect<string[] | null, DbError>;

// -----
// Records the zip a new upload Scan reads, in the Scan's own
// transaction; refuses a zip that is not the app's.
// -----
export type LinkArchive = (link: ScanArchiveLink) => Effect.Effect<void, Invalid | DbError>;

// -----
// A Scan whose row, and hold if it takes one, are written but
// whose Workflow has not started.
// -----
export type QueuedScan = { params: ScanParams; holdUsd: number };
