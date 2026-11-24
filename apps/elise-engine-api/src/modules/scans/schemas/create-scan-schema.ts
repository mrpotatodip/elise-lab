import { z } from "zod";
import { SCAN_EFFORTS, SCAN_MODELS, SCAN_PROFILES } from "#/constants";
import { documentFields } from "#/lib/document-fields";
import { checkScopePaths, ScanQueuedSchema as ContractScanQueuedSchema } from "@repo/contracts/elise";
import { SCANS_GIT_REF, SCANS_PROVIDER } from "#/modules/scans/constants";
import { checkArchiveSource, checkRepoAddress } from "./repo-address-schema";

export const CreateScanBodySchema = z
  .object({
    provider: SCANS_PROVIDER,
    repo: z.string().meta({
      example: "https://github.com/octocat/Hello-World",
      description:
        "The repository's https address, read by the provider's own rules. For provider upload, the app's name.",
    }),
    model: z.enum(SCAN_MODELS).optional(),
    effort: z.enum(SCAN_EFFORTS).optional(),
    profile: z.enum(SCAN_PROFILES).optional(),
    max_budget_usd: z.number().positive().optional(),
    runner_id: z.uuid().optional().meta({
      description:
        "Run the scan on this Runner of the account instead of in EliseLAB's cloud. The Runner must be connected, and the repository public.",
    }),
    ref: z
      .string()
      .regex(SCANS_GIT_REF)
      .optional()
      .meta({ example: "main", description: "A branch, tag or commit to scan. Leave it out for the default branch." }),
    scope_paths: z
      .array(z.string())
      .optional()
      .meta({
        example: ["apps/api", "packages/db"],
        description:
          "Scan only these folders of the repository, written relative to its root, with no globs. At most 10. Runs on a Runner only. The Scan is a Partial Scan and never counts as a full pass in the Verdict. Leave it out to scan everything.",
      }),
    archive_id: z.uuid().optional().meta({
      description:
        "For provider upload only: the zip of the app to scan. An upload Scan runs on a Runner and takes no ref.",
    }),
  })
  .superRefine((body, ctx) => {
    checkRepoAddress(body, ctx);
    checkArchiveSource(body, ctx);
    const scope = body.scope_paths === undefined ? null : checkScopePaths(body.scope_paths);
    if (scope?.ok === false)
      ctx.addIssue({ code: "custom", path: ["scope_paths"], message: `scope_paths: ${scope.message}` });
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
