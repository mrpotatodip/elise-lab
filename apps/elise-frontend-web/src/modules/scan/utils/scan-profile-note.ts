import type { ProfileMetValue } from "@repo/contracts/elise";
import { SCAN_PROFILE_OPTIONS } from "../constants";
import type { ScanStatus } from "../schemas";
import type { ScanProfileNote } from "../types";

const RANK = { quick: 1, standard: 2, deep: 3 } as const;

const nameOf = (profile: ScanStatus["profile"]) =>
  SCAN_PROFILE_OPTIONS.find((option) => option.value === profile)?.label ?? profile;

export function scanProfileNote(
  asked: ScanStatus["profile"],
  met: ProfileMetValue | null | undefined,
): ScanProfileNote | null {
  if (met === null || met === undefined) return null;
  const askedName = nameOf(asked);

  if (met === "none") {
    return {
      kind: "unmet",
      badge: "Did not run as asked",
      title: `Asked for ${askedName}. Its work did not run.`,
      detail:
        "This Scan did not do the work of Focused, Balanced or Exhaustive. The findings are kept, but they do not come from a full review. Run the Scan again on a Runner or in the cloud.",
    };
  }

  if (RANK[met] >= RANK[asked]) return null;

  const metName = nameOf(met);
  return {
    kind: "lesser",
    badge: `Ran as ${metName}`,
    title: `Asked for ${askedName}. Ran as ${metName}${met === "quick" ? ", a single pass" : ""}.`,
    detail: `The extra work that ${askedName} needs did not run. The findings are kept. Run the Scan again on a Runner or in the cloud for the full work.`,
  };
}
