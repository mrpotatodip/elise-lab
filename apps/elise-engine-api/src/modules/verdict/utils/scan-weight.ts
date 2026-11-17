import { VERDICT_SCAN_WEIGHTS } from "@repo/contracts/elise";
import type { JudgedScan } from "#/modules/verdict/types";

const PROFILE_WEIGHTS = new Map<string, number>(Object.entries(VERDICT_SCAN_WEIGHTS));

export const scanWeight = ({ skill, profile, partial, profileMet }: Pick<JudgedScan, "skill" | "profile" | "partial" | "profileMet">): number => {
  if (skill === "lite") return VERDICT_SCAN_WEIGHTS.lite;
  if (partial !== false) return 0;
  if (profileMet === "none") return 0;
  return PROFILE_WEIGHTS.get(profileMet ?? profile) ?? 0;
};
