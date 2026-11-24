import { and, eq, inArray, or, sql } from "drizzle-orm";
import { VERDICT_SCAN_WEIGHTS } from "@repo/contracts/elise";
import { scans } from "@repo/db-elise/schema";
import type { JudgedScan } from "#/modules/verdict/types";

type Weighable = Pick<JudgedScan, "skill" | "profile" | "partial" | "profileMet">;

const PROFILE_WEIGHTS = new Map<string, number>(Object.entries(VERDICT_SCAN_WEIGHTS));

export const scanWeight = ({ skill, profile, partial, profileMet }: Weighable): number => {
  if (skill === "lite") return VERDICT_SCAN_WEIGHTS.lite;
  if (partial !== false) return 0;
  if (profileMet === "none") return 0;
  return PROFILE_WEIGHTS.get(profileMet ?? profile) ?? 0;
};

export const scanWasRead = (scan: Weighable): boolean =>
  scanWeight(scan) > 0 || scan.partial === true || scan.profileMet === "none";

const WEIGHED_PROFILES = Object.entries(VERDICT_SCAN_WEIGHTS)
  .filter(([name, weight]) => name !== "lite" && weight > 0)
  .map(([name]) => name);

export const weighedScanWhere = or(
  VERDICT_SCAN_WEIGHTS.lite > 0 ? eq(scans.skill, "lite") : undefined,
  and(eq(scans.partial, false), inArray(sql`coalesce(${scans.profileMet}, ${scans.profile})`, WEIGHED_PROFILES)),
);
