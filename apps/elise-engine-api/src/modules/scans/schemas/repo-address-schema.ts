import { z } from "zod";
import { DEFAULT_SOURCE_PROVIDER_ID, sourceProviderOf, type SourceProviderId } from "#/providers/registry";

export const SCANS_REPO_INPUT = z
  .string()
  .max(200)
  .meta({ example: "https://github.com/octocat/Hello-World", description: "The repository address, or for provider upload the app's name." });

// -----
// The repo is checked by its provider's own pattern: a GitHub
// address for github (and for a request without a provider),
// an app name for upload.
// -----
export const checkRepoAddress = (body: { provider?: SourceProviderId; repo: string }, ctx: z.RefinementCtx): void => {
  const provider = body.provider ?? DEFAULT_SOURCE_PROVIDER_ID;
  if (sourceProviderOf(provider).addressPattern.test(body.repo)) return;
  ctx.addIssue({ code: "custom", path: ["repo"], message: provider === "upload" ? "repo: not an app name" : `repo: not a ${provider} address` });
};

// -----
// A provider that is an archive (upload) is scanned one zip
// at a time, on a Runner, with no ref: the zip is the version.
// Any other provider takes no zip.
// -----
export const checkArchiveSource = (body: { provider?: SourceProviderId; archive_id?: string; runner_id?: string; ref?: string }, ctx: z.RefinementCtx): void => {
  const isArchive = sourceProviderOf(body.provider ?? DEFAULT_SOURCE_PROVIDER_ID).capabilities.isArchive;
  const issue = (field: string, message: string) => ctx.addIssue({ code: "custom", path: [field], message: `${field}: ${message}` });
  if (!isArchive) {
    if (body.archive_id !== undefined) issue("archive_id", "only an upload app takes a zip");
    return;
  }
  if (body.archive_id === undefined) issue("archive_id", "pick the zip of the upload app to scan");
  if (body.runner_id === undefined) issue("runner_id", "an upload app is scanned on a Runner");
  if (body.ref !== undefined) issue("ref", "an upload app has no branches; pick a zip with archive_id");
};
