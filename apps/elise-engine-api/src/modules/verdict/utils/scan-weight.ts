import { VERDICT_SCAN_WEIGHTS } from "@repo/contracts/elise";
import type { JudgedScan } from "#/modules/verdict/types";

// -----
// How much one succeeded scan counts toward the verdict. The
// Skill is read first: a lite scan weighs 1 whatever profile
// its row carries. A full scan weighs its profile's weight
// only when its partial column is set (the column is written
// with the findings, so an older full scan, whose findings
// were never recorded, weighs 0), and a partial scan weighs 0
// so it cannot make a commit pass alone. A name the table
// does not know weighs 0.
//
// A full scan whose profile was checked (profileMet) weighs the
// profile it met, not the one it asked for, and a scan that met
// none weighs 0. A scan with no profileMet (a cloud scan, an
// old row) weighs the profile it asked for. A partial scan
// weighs 0 before profileMet is looked at.
// -----
const PROFILE_WEIGHTS = new Map<string, number>(Object.entries(VERDICT_SCAN_WEIGHTS));

export const scanWeight = ({ skill, profile, partial, profileMet }: Pick<JudgedScan, "skill" | "profile" | "partial" | "profileMet">): number => {
  if (skill === "lite") return VERDICT_SCAN_WEIGHTS.lite;
  if (partial !== false) return 0;
  if (profileMet === "none") return 0;
  return PROFILE_WEIGHTS.get(profileMet ?? profile) ?? 0;
};
