import { DEFAULT_SOURCE_PROVIDER } from "@repo/contracts/elise";
import type { SourceProvider } from "#/providers/port";
import { githubProvider } from "#/providers/github";
import { uploadProvider } from "#/providers/upload";

// -----
// The only file that may import every provider. A new
// provider is one folder under src/providers and one
// line here. A provider of the contracts' union that
// has no line here is refused by every request.
// -----
export const SOURCE_PROVIDERS = {
  github: githubProvider,
  upload: uploadProvider,
} as const satisfies Readonly<Partial<Record<SourceProvider["id"], SourceProvider>>>;

export type SourceProviderId = keyof typeof SOURCE_PROVIDERS;

export const SOURCE_PROVIDER_IDS =
  // SAFETY: the keys of SOURCE_PROVIDERS are exactly the SourceProviderId union, and it has at least one.
  Object.keys(SOURCE_PROVIDERS) as [SourceProviderId, ...SourceProviderId[]];

export const DEFAULT_SOURCE_PROVIDER_ID = DEFAULT_SOURCE_PROVIDER satisfies SourceProviderId;

export const sourceProviderOf = (id: SourceProviderId): SourceProvider => SOURCE_PROVIDERS[id];
