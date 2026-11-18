import { DEFAULT_SOURCE_PROVIDER_ID, sourceProviderOf } from "#/providers/registry";

const provider = sourceProviderOf(DEFAULT_SOURCE_PROVIDER_ID);

// -----
// Every Repo is a github one until Repos store their
// provider: both read through the github provider.
// -----
export const canonicalRepo = (url: string): string => provider.canonical(url);

export const displayRepoUrl = (url: string): string => provider.display(url);
