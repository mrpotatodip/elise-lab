import { z } from "zod";
import { ScanOptionsSchema as ContractScanOptionsSchema } from "@repo/contracts/elise";
import { SCAN_MODELS } from "#/constants";
import { documentFields } from "#/lib/document-fields";

export const ScanOptionsSchema = documentFields(ContractScanOptionsSchema, {
  skill: { example: "lite" },
  effort: { example: "low" },
  profile: { example: "quick" },
  maxBudgetUsd: { example: 1 },
}).extend({
  model: z.enum(SCAN_MODELS).meta({ example: "claude-haiku-5-5" }),
});

export type ScanOptions = z.infer<typeof ScanOptionsSchema>;
