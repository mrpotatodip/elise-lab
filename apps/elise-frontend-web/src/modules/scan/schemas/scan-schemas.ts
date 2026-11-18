import { z } from "zod";
import { SCAN_EFFORTS, SCAN_MODELS, SCAN_PROFILES, SourceProviderSchema } from "@repo/contracts/elise";
import { DEFAULT_SOURCE_PROVIDER_ID, isGitSourceProvider, sourceProviderOf } from "#/providers/registry";

export { SCAN_EFFORTS, SCAN_MODELS, SCAN_PROFILES, SCAN_SKILLS, RepoDetailSchema, RepoListSchema, RepoParamSchema, ScanListSchema, ScanQueuedSchema, ScanStateSchema, ScanStatusSchema } from "@repo/contracts/elise";
export type { Repo, RepoBranch, ScanState, ScanStatus, SourceProviderValue } from "@repo/contracts/elise";

// -----
// The repo is checked by the parser of the provider the plan
// names, github when it names none, as the engine does. A
// provider whose flow is not built yet (upload) starts no Scan.
// -----
export const CreateScanInputSchema = z
  .object({
    provider: SourceProviderSchema.optional(),
    repo: z.string(),
    model: z.enum(SCAN_MODELS),
    effort: z.enum(SCAN_EFFORTS),
    profile: z.enum(SCAN_PROFILES),
    ref: z.string().optional(),
    runnerId: z.uuid().optional(),
  })
  .superRefine((input, ctx) => {
    const provider = sourceProviderOf(input.provider ?? DEFAULT_SOURCE_PROVIDER_ID);
    if (!provider.available || !isGitSourceProvider(provider)) {
      ctx.addIssue({ code: "custom", path: ["provider"], message: `${provider.label} audits are not open yet.` });
      return;
    }
    if (!provider.address.pattern.test(input.repo)) ctx.addIssue({ code: "custom", path: ["repo"], message: provider.address.message });
  });

export const ScanIdInputSchema = z.object({ scanId: z.string().regex(/^[\w-]+$/) });

export const ScanFileInputSchema = ScanIdInputSchema.extend({ file: z.string().regex(/^[\w.-]+$/) });

export const ScanCursorInputSchema = z.object({ cursor: z.string().optional() });

export type CreateScanInput = z.infer<typeof CreateScanInputSchema>;

export { DiffEntrySchema, ScanDiffSchema } from "@repo/contracts/elise";
export type { DiffEntry, ScanDiff } from "@repo/contracts/elise";

export type { SeverityCounts } from "@repo/contracts/elise";

export const VerdictInputSchema = z.object({ repoId: z.string().regex(/^[\w-]+$/), commit: z.string().regex(/^[0-9a-fA-F]{40}$/) });

export { VerdictSchema } from "@repo/contracts/elise";
export type { Verdict, VerdictFinding } from "@repo/contracts/elise";
