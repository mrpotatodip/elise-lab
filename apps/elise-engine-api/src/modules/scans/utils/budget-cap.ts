import { RUNNER_MAX_BUDGET_USD } from "#/modules/runners/constants";
import { SCAN_PROFILE_CAPS_USD, SCAN_PROFILES } from "#/constants";
import type { CreateScanEnv } from "#/modules/scans/types";

type BudgetCap = { ok: true; defaultUsd: number; ceilingUsd: number } | { ok: false; message: string };

// -----
// What a refused full Scan tells the Account about the Monthly budget:
// the biggest profile below the one asked for whose cap, times the
// markup, fits in what is left (in credit dollars), or the sentence
// that none does. It reads the same table as the caps.
// -----
export const budgetRefusalHintOf = (
  profile: (typeof SCAN_PROFILES)[number],
  leftUsd: number,
  markup: number,
): string => {
  const smaller = SCAN_PROFILES.slice(0, SCAN_PROFILES.indexOf(profile)).toReversed();
  const fits = smaller.find((name) => SCAN_PROFILE_CAPS_USD[name] * markup <= leftUsd);
  if (fits) return `The ${fits} profile would fit`;
  return `The monthly budget is too low for any profile: $${Math.max(0, leftUsd).toFixed(2)} is left`;
};

// -----
// The Budget cap of a new Scan, read at this one point: what it gets
// when the request names none (defaultUsd) and the most a request may
// ask for (ceilingUsd).
// A Scan on a Runner starts at the cap of its profile and a request
// may raise it up to the Runner's ceiling. Every other Scan, on either
// key, gets the cap of its profile, and a request may lower it only. A
// profile whose cap is above MAX_BUDGET_FULL_USD is refused, so a
// wrong table never starts a Scan.
// -----
export const budgetCapOf = (
  env: Pick<CreateScanEnv, "MAX_BUDGET_FULL_USD">,
  scan: { profile: (typeof SCAN_PROFILES)[number]; onRunner: boolean },
): BudgetCap => {
  const profileCapUsd = SCAN_PROFILE_CAPS_USD[scan.profile];
  if (scan.onRunner) return { ok: true, defaultUsd: profileCapUsd, ceilingUsd: RUNNER_MAX_BUDGET_USD };
  const fullCeilingUsd = Number(env.MAX_BUDGET_FULL_USD);
  if (!(profileCapUsd <= fullCeilingUsd)) {
    return {
      ok: false,
      message: `The ${scan.profile} profile's cap of $${profileCapUsd} is above the ceiling of $${fullCeilingUsd} for full scans, so it cannot start`,
    };
  }
  return { ok: true, defaultUsd: profileCapUsd, ceilingUsd: profileCapUsd };
};
