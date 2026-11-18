import { z } from "zod";
import { SCAN_EFFORTS, SCAN_MODELS, SCAN_PROFILES } from "#/constants";
import { documentFields } from "#/lib/document-fields";
import { ScanQueuedSchema as ContractScanQueuedSchema } from "@repo/contracts/elise";
import { SCANS_GIT_REF, SCANS_REPO_ADDRESS } from "#/modules/scans/constants";

export const CreateScanBodySchema = z.object({
  repo: z.string().regex(SCANS_REPO_ADDRESS).meta({ example: "https://github.com/octocat/Hello-World" }),
  model: z.enum(SCAN_MODELS).optional(),
  effort: z.enum(SCAN_EFFORTS).optional(),
  profile: z.enum(SCAN_PROFILES).optional(),
  max_budget_usd: z.number().positive().optional(),
  runner_id: z.uuid().optional().meta({ description: "Run the scan on this Runner of the account instead of in EliseLAB's cloud. The Runner must be connected, and the repository public." }),
  ref: z
    .string()
    .regex(SCANS_GIT_REF)
    .optional()
    .meta({ example: "main", description: "A branch, tag or commit to scan. Leave it out for the default branch." }),
});

export const ScanQueuedSchema = documentFields(ContractScanQueuedSchema, {
  skill: { example: "lite" },
  effort: { example: "low" },
  profile: { example: "quick" },
  maxBudgetUsd: { example: 1 },
  scanId: { example: "zd3u73nfd-06ac9c07-b80c-45da-8fc5-ece4768b5b22" },
});

export type CreateScanBody = z.infer<typeof CreateScanBodySchema>;
export type ScanQueued = z.infer<typeof ScanQueuedSchema>;
