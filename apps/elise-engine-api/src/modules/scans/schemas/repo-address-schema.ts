import type { z } from "zod";
import { DEFAULT_SOURCE_PROVIDER_ID, sourceProviderOf, type SourceProviderId } from "#/providers/registry";

// -----
// The repo address is checked by the parser of the provider
// the request names, github when it names none, so a GitLab
// address sent as github (or the reverse) is refused.
// -----
export const checkRepoAddress = (body: { provider?: SourceProviderId; repo: string }, ctx: z.RefinementCtx): void => {
  const provider = sourceProviderOf(body.provider ?? DEFAULT_SOURCE_PROVIDER_ID);
  if (!provider.addressPattern.test(body.repo)) ctx.addIssue({ code: "custom", path: ["repo"], message: provider.addressMessage });
};
