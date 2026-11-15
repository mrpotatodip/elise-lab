import { z } from "zod";
import { FINDING_SEVERITY_VALUES } from "@repo/contracts/elise";

// -----
// The nested record the full skill writes to findings.json
// (skills/security-audit/report-schema.json). Only the fields
// a scan_findings row needs are read; the skill's own
// validator already checked the rest. A rejected record is
// not recorded, so nothing of it is read.
// -----
const EvidenceSchema = z.object({ file: z.string().min(1), line: z.number().int(), description: z.string() });

const ConfirmedSchema = z.object({
  verdict: z.literal("confirmed"),
  fingerprint: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  severity: z.object({ overall_severity: z.enum(FINDING_SEVERITY_VALUES) }),
  evidence: z.array(EvidenceSchema).default([]),
  remediation: z.object({ strategy: z.string() }),
});

const NeedsValidationSchema = z.object({
  verdict: z.literal("needs_validation"),
  fingerprint: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  evidence: z.array(EvidenceSchema).default([]),
  validation_plan: z.object({ local: z.string().optional(), deployment: z.string().optional() }),
});

const RejectedSchema = z.object({ verdict: z.literal("rejected") });

export const FullFindingsSchema = z.array(z.discriminatedUnion("verdict", [ConfirmedSchema, NeedsValidationSchema, RejectedSchema]));

export type FullFinding = Exclude<z.infer<typeof FullFindingsSchema>[number], { verdict: "rejected" }>;
