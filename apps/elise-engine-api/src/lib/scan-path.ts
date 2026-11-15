import type { ScanOptions } from "#/schemas";

// -----
// Which of the two limit pools a Scan counts in. Every new Scan runs the
// full Skill on the one Workflow, Sandbox class and Image, so this is no
// longer a choice of code path: it only says which counts a Scan meets
// (scan-limits.ts). A Scan on a Runner, or an old lite Scan that is still
// live, is in the "lite" pool. Decisions: ADR 0006.
// -----
export type ScanPath = "lite" | "full";

export const scanPathOf = (skill: ScanOptions["skill"]): ScanPath => (skill === "full" ? "full" : "lite");
