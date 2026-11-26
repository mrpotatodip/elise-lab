import type { CreditBalance, ScanProfileCap } from "@repo/contracts/elise";

// -----
// The most credit a scan of this profile may hold before it starts, as the
// engine says it (GET /usage/credit). Null when the engine gives none: an
// account on its own key, an engine that sends no profiles, or credit not
// loaded yet. The dashboard never works the number out.
// -----
export const creditProfileHold = (
  credit: Pick<CreditBalance, "profiles"> | undefined,
  profile: ScanProfileCap["profile"],
) => credit?.profiles?.find((item) => item.profile === profile)?.holdUsd ?? null;

// -----
// The month's scans, against the plan's allowance when it has one.
// -----
export const creditScansLabel = (scans: number, allowance: number | null) =>
  allowance === null ? String(scans) : `${scans} of ${allowance}`;
