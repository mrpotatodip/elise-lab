import { z } from "zod";
import { SCAN_PROFILES } from "../scan";

export const PROFILE_CHECK_ROW_IDS = [
  "hunter-wave",
  "fresh-verifier-per-candidate",
  "final-critic-pass",
  "not-declared-incomplete",
  "units-not-coarsened",
  "final-records-fresh-verifier",
  "units-per-lifecycle-mode",
  "critic-waves-to-clean",
  "final-records-separate-verifier",
] as const;

export const PROFILE_CHECK_FILES = ["coverage-ledger.json", "run-metadata.json", "findings.json"] as const;

export const ProfileCheckRowSchema = z.object({
  id: z.enum(PROFILE_CHECK_ROW_IDS),
  profile: z.enum(SCAN_PROFILES),
  requirement: z.string().min(1),
  file: z.enum(PROFILE_CHECK_FILES),
  field: z.string().min(1),
  needsSkillChange: z.boolean(),
});

export const ProfileCheckLeftOutSchema = z.object({
  requirement: z.string().min(1),
  why: z.string().min(1),
});

export const ProfileCheckSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("met") }),
  z.object({ result: z.literal("lesser"), profile: z.enum(SCAN_PROFILES) }),
  z.object({ result: z.literal("unmet") }),
]);

export type ProfileCheckRow = z.infer<typeof ProfileCheckRowSchema>;
export type ProfileCheckRowId = ProfileCheckRow["id"];
export type ProfileCheckLeftOut = z.infer<typeof ProfileCheckLeftOutSchema>;
export type ProfileCheck = z.infer<typeof ProfileCheckSchema>;
