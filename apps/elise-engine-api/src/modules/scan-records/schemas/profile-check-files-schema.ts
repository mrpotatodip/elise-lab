import { z } from "zod";

// -----
// The files the profile check reads, cut to the fields of
// PROFILE_CHECK_ROWS. The agent wrote them, so a field it left out
// is a default and a field of the wrong type fails the parse.
// -----
const jsonText = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .transform((text, ctx) => {
      try {
        return JSON.parse(text);
      } catch {
        ctx.addIssue({ code: "custom", message: "the file is not JSON" });
        return z.NEVER;
      }
    })
    .pipe(schema);

const UnitSchema = z.object({
  status: z.string(),
  agent_id: z.string().nullish(),
  wave: z.number().nullish(),
  attempts: z.array(z.object({ wave: z.number() })).default([]),
  local_checks: z.array(z.object({ agent_id: z.string() })).default([]),
  result_fingerprints: z.array(z.string()).default([]),
  unresolved: z.array(z.string()).default([]),
  canonical_refs: z.object({ subsystem: z.string().optional(), lifecycle: z.string().optional() }).optional(),
});

const MetadataSchema = z.object({
  run_status: z.string().optional(),
  critic_passes: z.array(z.object({ wave: z.number(), accepted: z.number().min(0) })).default([]),
  final_verifiers: z.array(z.object({ fingerprint: z.string(), agent_id: z.string() })).default([]),
});

const CheckedFindingSchema = z.object({ verdict: z.string(), fingerprint: z.string() });

export const ProfileCheckLedgerTextSchema = jsonText(z.array(UnitSchema));
export const ProfileCheckMetadataTextSchema = jsonText(MetadataSchema);
export const ProfileCheckFindingsTextSchema = jsonText(z.array(CheckedFindingSchema));

export type ProfileCheckUnit = z.infer<typeof UnitSchema>;
export type ProfileCheckMetadata = z.infer<typeof MetadataSchema>;
export type ProfileCheckFinding = z.infer<typeof CheckedFindingSchema>;
