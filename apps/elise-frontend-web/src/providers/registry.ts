import { DEFAULT_SOURCE_PROVIDER, SOURCE_PROVIDER_VALUES, type SourceProviderValue } from "@repo/contracts/elise";
import type { GitSourceProvider, SourceProvider } from "#/providers/port";
import { githubProvider } from "#/providers/github";
import { gitlabProvider } from "#/providers/gitlab";
import { gitlabShProvider } from "#/providers/gitlab-sh";
import { uploadProvider } from "#/providers/upload";

// -----
// The only file that may import every provider. A new
// provider is one folder under src/providers and one
// line here. The key set is the contracts' union, so a
// provider the contracts add fails the build until it
// has its line.
// -----
export const SOURCE_PROVIDERS = {
  github: githubProvider,
  gitlab: gitlabProvider,
  "gitlab-sh": gitlabShProvider,
  upload: uploadProvider,
} as const satisfies Readonly<Record<SourceProviderValue, SourceProvider>>;

export type SourceProviderId = SourceProviderValue;

export const DEFAULT_SOURCE_PROVIDER_ID = DEFAULT_SOURCE_PROVIDER;

export const DEFAULT_SOURCE_PROVIDER_ENTRY: GitSourceProvider = SOURCE_PROVIDERS[DEFAULT_SOURCE_PROVIDER_ID];

// -----
// The picker's order is the contracts' order.
// -----
export const SOURCE_PROVIDER_LIST: readonly SourceProvider[] = SOURCE_PROVIDER_VALUES.map((id) => SOURCE_PROVIDERS[id]);

export const sourceProviderOf = (id: SourceProviderId): SourceProvider => SOURCE_PROVIDERS[id];

export const isGitSourceProvider = (provider: SourceProvider): provider is GitSourceProvider =>
  provider.address !== null;

// -----
// The git provider whose strict pattern an address meets, or
// null. The patterns do not overlap: gitlab-sh refuses
// github.com and gitlab.com.
// -----
export const sourceProviderOfAddress = (address: string): GitSourceProvider | null =>
  SOURCE_PROVIDER_LIST.filter(isGitSourceProvider).find((provider) => provider.address.pattern.test(address)) ?? null;
