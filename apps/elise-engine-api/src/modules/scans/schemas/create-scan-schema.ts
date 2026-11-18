import { z } from "zod";
import { SCAN_EFFORTS, SCAN_MODELS, SCAN_PROFILES } from "#/constants";
import { documentFields } from "#/lib/document-fields";
import { ScanQueuedSchema as ContractScanQueuedSchema } from "@repo/contracts/elise";
import { SCANS_GIT_REF, SCANS_PROVIDER } from "#/modules/scans/constants";
import { checkArchiveSource, checkRepoAddress, SCANS_REPO_INPUT } from "./repo-address-schema";

export const CreateScanBodySchema = z.object({
  provider: SCANS_PROVIDER,
  repo: SCANS_REPO_INPUT,
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
  archive_id: z.uuid().optional().meta({ description: "For provider upload only: the zip of the app to scan. An upload Scan runs on a Runner and takes no ref." }),
}).superRefine((body, ctx) => {
  checkRepoAddress(body, ctx);
  checkArchiveSource(body, ctx);
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
