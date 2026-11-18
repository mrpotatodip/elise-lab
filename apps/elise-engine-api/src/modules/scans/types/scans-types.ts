import type { Effect } from "effect";
import type { DbError } from "#/lib/effect-query";
import type { ScanParams } from "#/schemas";
import type { AppDeps, Bindings } from "#/types/variables";

// -----
// Service inputs
// -----
export type CreateScanEnv = Pick<Bindings, "SCAN_WORKFLOW_FULL" | "MODEL" | "EFFORT" | "MAX_BUDGET_FULL_USD" | "MAX_ACTIVE_SCANS" | "MAX_ACTIVE_FULL_SCANS" | "MAX_GLOBAL_FULL_SCANS" | "MONTHLY_BUDGET_USD" | "BUDGET_ALLOWANCE_USD" | "BILLING_ENFORCED">;
export type DetailScanEnv = Pick<Bindings, "SCAN_WORKFLOW_FULL">;
export type SubmitScanDeps = Pick<AppDeps, "scanRepo" | "githubAccess" | "monthSpend" | "holdCredit" | "releaseCredit" | "runnerConnected">;

// -----
// Whether a Runner of the Account has paired and is not removed.
// -----
export type RunnerConnected = (runnerId: string) => Effect.Effect<boolean, DbError>;

// -----
// A Scan whose row, and hold if it takes one, are written but
// whose Workflow has not started.
// -----
export type QueuedScan = { params: ScanParams; holdUsd: number };
