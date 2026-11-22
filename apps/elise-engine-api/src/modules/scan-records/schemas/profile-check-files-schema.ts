import { z } from "zod";

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

// -----
// The Skill words `accepted` as "accepted missing units plus legitimate
// reassignments", so an agent often writes the list it accepted, not a count,
// and the Skill's validators do not check the field. A list counts as its
// length: a run that recorded a critic pass is not read as having none.
// -----
const AcceptedSchema = z.union([z.number().min(0), z.array(z.unknown()).transform((items) => items.length)]);

const MetadataSchema = z.object({
  run_status: z.string().optional(),
  critic_passes: z.array(z.object({ wave: z.number(), accepted: AcceptedSchema })).default([]),
  final_verifiers: z.array(z.object({ fingerprint: z.string(), agent_id: z.string() })).default([]),
});

const CheckedFindingSchema = z.object({ verdict: z.string(), fingerprint: z.string() });

export const ProfileCheckLedgerTextSchema = jsonText(z.array(UnitSchema));
export const ProfileCheckMetadataTextSchema = jsonText(MetadataSchema);
export const ProfileCheckFindingsTextSchema = jsonText(z.array(CheckedFindingSchema));

export type ProfileCheckUnit = z.infer<typeof UnitSchema>;
export type ProfileCheckMetadata = z.infer<typeof MetadataSchema>;
export type ProfileCheckFinding = z.infer<typeof CheckedFindingSchema>;
