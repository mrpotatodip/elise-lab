import { RUNNER_MAX_BUDGET_USD } from "#/modules/runners/constants";
import { SCAN_PROFILE_CAPS_USD, type SCAN_PROFILES, type SCAN_SKILLS } from "#/constants";
import type { CreateScanEnv } from "#/modules/scans/types";

type BudgetCap = { ok: true; defaultUsd: number; ceilingUsd: number } | { ok: false; message: string };

// -----
// The Budget cap of a new Scan, read at this one point: what it gets
// when the request names none (defaultUsd) and the most a request may
// ask for (ceilingUsd).
// A Scan on a Runner has its safety cap. A full Scan, on either key,
// gets the cap of its profile, and a request may lower it only. A
// profile whose cap is above MAX_BUDGET_FULL_USD is refused, so a
// wrong table never starts a Scan. A lite Scan keeps its two ceilings
// (the platform's key and the Account's own) until #141 removes them.
// -----
export const budgetCapOf = (
  env: Pick<CreateScanEnv, "MAX_BUDGET_USD" | "MAX_BUDGET_OWN_KEY_USD" | "MAX_BUDGET_FULL_USD">,
  scan: { skill: (typeof SCAN_SKILLS)[number]; profile: (typeof SCAN_PROFILES)[number]; onRunner: boolean; ownKeyScan: boolean },
): BudgetCap => {
  if (scan.onRunner) return { ok: true, defaultUsd: RUNNER_MAX_BUDGET_USD, ceilingUsd: RUNNER_MAX_BUDGET_USD };
  if (scan.skill === "full") {
    const profileCapUsd = SCAN_PROFILE_CAPS_USD[scan.profile];
    const fullCeilingUsd = Number(env.MAX_BUDGET_FULL_USD);
    if (!(profileCapUsd <= fullCeilingUsd)) {
      return { ok: false, message: `The ${scan.profile} profile's cap of $${profileCapUsd} is above the ceiling of $${fullCeilingUsd} for full scans, so it cannot start` };
    }
    return { ok: true, defaultUsd: profileCapUsd, ceilingUsd: profileCapUsd };
  }
  const ceilingUsd = Number(scan.ownKeyScan ? env.MAX_BUDGET_OWN_KEY_USD : env.MAX_BUDGET_USD);
  return { ok: true, defaultUsd: ceilingUsd, ceilingUsd };
};
