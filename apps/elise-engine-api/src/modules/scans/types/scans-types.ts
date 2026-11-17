import type { Bindings } from "#/types/variables";

// -----
// Service inputs
// -----
export type CreateScanEnv = Pick<Bindings, "SCAN_WORKFLOW_FULL" | "MODEL" | "EFFORT" | "MAX_BUDGET_FULL_USD" | "MAX_ACTIVE_SCANS" | "MAX_ACTIVE_FULL_SCANS" | "MAX_GLOBAL_FULL_SCANS" | "MONTHLY_BUDGET_USD" | "BUDGET_ALLOWANCE_USD" | "BILLING_ENFORCED">;
export type DetailScanEnv = Pick<Bindings, "SCAN_WORKFLOW_FULL">;
