import { z } from "zod";
import {
  RUNNER_SPEND_LIMIT_MAX_USD,
  SCAN_EFFORTS,
  SCAN_MODELS,
  SCAN_PROFILES,
  SCAN_SCOPE_PATHS_MAX,
  SourceProviderSchema,
  VerdictQuerySchema,
} from "@repo/contracts/elise";
import { DEFAULT_SOURCE_PROVIDER_ID, isGitSourceProvider, sourceProviderOf } from "#/providers/registry";

export {
  SCAN_EFFORTS,
  SCAN_MODELS,
  SCAN_PROFILES,
  SCAN_SKILLS,
  RepoDetailSchema,
  RepoListSchema,
  RepoParamSchema,
  ScanListSchema,
  ScanQueuedSchema,
  ScanStateSchema,
  ScanStatusSchema,
  TraceSchema,
} from "@repo/contracts/elise";
export type {
  Repo,
  RepoBranch,
  ScanState,
  ScanStatus,
  SourceProviderValue,
  Trace,
  TraceEntry,
} from "@repo/contracts/elise";

// -----
// The repo is checked by the parser of the provider the plan
// names, github when it names none, as the engine does. An
// archive provider (upload) reads one zip, chosen by its id,
// and has no ref; a git provider takes no zip. A provider whose
// flow is not built yet starts no Scan.
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
    archiveId: z.uuid().optional(),
    maxBudgetUsd: z.number().min(1).max(RUNNER_SPEND_LIMIT_MAX_USD).optional(),
    scopePaths: z.array(z.string()).max(SCAN_SCOPE_PATHS_MAX).optional(),
  })
  .superRefine((input, ctx) => {
    const provider = sourceProviderOf(input.provider ?? DEFAULT_SOURCE_PROVIDER_ID);
    if (!provider.available) {
      ctx.addIssue({ code: "custom", path: ["provider"], message: `${provider.label} audits are not open yet.` });
      return;
    }
    if (provider.capabilities.isArchive) {
      if (input.archiveId === undefined)
        ctx.addIssue({ code: "custom", path: ["archiveId"], message: "Pick the zip to scan." });
      if (input.ref !== undefined)
        ctx.addIssue({ code: "custom", path: ["ref"], message: "An upload app has no branches: pick a zip instead." });
      return;
    }
    if (input.archiveId !== undefined)
      ctx.addIssue({ code: "custom", path: ["archiveId"], message: "Only an upload app takes a zip." });
    if (isGitSourceProvider(provider) && !provider.address.pattern.test(input.repo))
      ctx.addIssue({ code: "custom", path: ["repo"], message: provider.address.message });
  });

export const ScanIdInputSchema = z.object({ scanId: z.string().regex(/^[\w-]+$/) });

export const ScanTraceInputSchema = ScanIdInputSchema.extend({ after: z.string().optional() });

export const ScanFileInputSchema = ScanIdInputSchema.extend({ file: z.string().regex(/^[\w.-]+$/) });

export const ScanCursorInputSchema = z.object({ cursor: z.string().optional() });

export type CreateScanInput = z.infer<typeof CreateScanInputSchema>;

export { DiffEntrySchema, ScanDiffSchema } from "@repo/contracts/elise";
export type { DiffEntry, ScanDiff } from "@repo/contracts/elise";

export type { SeverityCounts } from "@repo/contracts/elise";

// -----
// The commit is the engine's own rule: a git commit, or for an
// upload app the SHA-256 of a zip, which stands in for it.
// -----
export const VerdictInputSchema = VerdictQuerySchema.extend({ repoId: z.string().regex(/^[\w-]+$/) });

export { VerdictSchema } from "@repo/contracts/elise";
export type { Verdict, VerdictFinding } from "@repo/contracts/elise";
