import type { z } from "zod";
import { DEFAULT_SOURCE_PROVIDER_ID, sourceProviderOf, type SourceProviderId } from "#/providers/registry";

// -----
// The repo address is checked by the parser of the provider
// the request names, github when it names none, so a GitLab
// address sent as github (or the reverse) is refused. For
// upload, the address is the app's name.
// -----
export const checkRepoAddress = (body: { provider?: SourceProviderId; repo: string }, ctx: z.RefinementCtx): void => {
  const provider = sourceProviderOf(body.provider ?? DEFAULT_SOURCE_PROVIDER_ID);
  if (!provider.addressPattern.test(body.repo)) ctx.addIssue({ code: "custom", path: ["repo"], message: provider.addressMessage });
};

// -----
// A provider that is an archive (upload) is scanned one zip
// at a time, with no ref: the zip is the version. Any other
// provider takes no zip. That it runs only on a Runner is the
// cloudScans rule of create-scan.
// -----
export const checkArchiveSource = (body: { provider?: SourceProviderId; archive_id?: string; ref?: string }, ctx: z.RefinementCtx): void => {
  const isArchive = sourceProviderOf(body.provider ?? DEFAULT_SOURCE_PROVIDER_ID).capabilities.isArchive;
  const issue = (field: string, message: string) => ctx.addIssue({ code: "custom", path: [field], message: `${field}: ${message}` });
  if (!isArchive) {
    if (body.archive_id !== undefined) issue("archive_id", "only an upload app takes a zip");
    return;
  }
  if (body.archive_id === undefined) issue("archive_id", "pick the zip of the upload app to scan");
  if (body.ref !== undefined) issue("ref", "an upload app has no branches; pick a zip with archive_id");
};
