import { scanPathOf, type ScanPath } from "#/lib/scan-path";
import type { ScanOptions } from "#/schemas";
import type { ActiveCounts } from "#/modules/scan-ledger";
import type { CreateScanEnv } from "#/modules/scans/types";

export type ScanRefusal = { code: "TOO_MANY_ACTIVE_SCANS" | "SCAN_WORKER_BUSY"; message: string };

// -----
// The pool's own count of live Scans for one Account. A Scan in our cloud
// counts in the full pool (MAX_ACTIVE_FULL_SCANS), a Scan on a Runner in
// the other one (MAX_ACTIVE_SCANS), so an Account at its full limit can
// still start a Scan on its Runner and the other way round.
// -----
export const accountLimitOf = (env: Pick<CreateScanEnv, "MAX_ACTIVE_SCANS" | "MAX_ACTIVE_FULL_SCANS">, path: ScanPath): number =>
  Number(path === "full" ? env.MAX_ACTIVE_FULL_SCANS : env.MAX_ACTIVE_SCANS);

// -----
// Which of the two counts a live Scan is in. A Scan on a Runner is always
// in the MAX_ACTIVE_SCANS one ("lite"), whatever Skill it runs: it holds
// no Sandbox of ours, so it meets only that limit and never uses up a
// place of the full limit. An old lite Scan that is still live is in it
// too.
// -----
export const limitPathOf = (scan: { skill: ScanOptions["skill"]; runner?: { id: string } | null }): ScanPath =>
  scan.runner ? "lite" : scanPathOf(scan.skill);

const POOL_NAME = { full: "full", lite: "Runner" } as const;

// -----
// Why a new Scan may not start now, or null. The Account's own count is
// checked first: it is the answer a person can act on. A Scan that meets
// a global cap is refused, not queued: a queue would hide a wait
// the person cannot see and cannot cancel. A Scan on a Runner holds no
// Sandbox of ours, so it passes null for the global counts and meets no
// global cap.
// -----
export const scanRefusalOf = (
  env: CreateScanEnv,
  path: ScanPath,
  accountActive: number,
  globalActive: ActiveCounts | null,
): ScanRefusal | null => {
  const accountLimit = accountLimitOf(env, path);
  if (accountActive >= accountLimit) {
    return { code: "TOO_MANY_ACTIVE_SCANS", message: `This account already has ${accountActive} active ${POOL_NAME[path]} scans (limit ${accountLimit})` };
  }
  if (path === "full" && globalActive !== null && globalActive.full >= Number(env.MAX_GLOBAL_FULL_SCANS)) {
    return { code: "SCAN_WORKER_BUSY", message: "EliseLAB is busy with full scans right now. Try again in a few minutes." };
  }
  return null;
};
