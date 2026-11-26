import type { CreditBalance, ScanProfileCap } from "@repo/contracts/elise";
import { SCAN_PROFILES, SCAN_PROFILE_CAPS_USD } from "#/constants";
import type { PlanState } from "#/modules/billing";
import { holdOf } from "./credit-utils";

// -----
// The cap of each scan profile and the credit it holds. The hold is
// the cap times the plan's markup, so only a plan on the platform's
// key has one; the dashboard cannot work it out, the markup is not in
// the contracts.
// -----
export const profileCapsOf = (plan: PlanState | null): ScanProfileCap[] =>
  SCAN_PROFILES.map((profile) => ({
    profile,
    capUsd: SCAN_PROFILE_CAPS_USD[profile],
    holdUsd: plan?.keySource === "platform" ? holdOf(SCAN_PROFILE_CAPS_USD[profile], plan.creditMarkup) : null,
  }));

// -----
// What the dashboard shows of an Account's credit: the plan and what
// it grants, the balance, and the month's scans against the plan's
// allowance. An Account with no plan has none of it.
// -----
export const creditBalanceOf = (spend: { plan: PlanState | null; scans: number }): CreditBalance => {
  const { plan, scans } = spend;
  const profiles = profileCapsOf(plan);
  if (plan === null)
    return { planKey: null, keySource: null, balanceUsd: 0, monthlyCreditUsd: 0, scans, scanAllowance: null, profiles };
  return {
    planKey: plan.planKey,
    keySource: plan.keySource,
    balanceUsd: plan.creditBalanceUsd,
    monthlyCreditUsd: plan.includedCreditUsd,
    scans,
    scanAllowance: plan.monthlyScanAllowance,
    profiles,
  };
};
