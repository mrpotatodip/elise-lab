import type { SourceProvider } from "#/providers/port";
import { githubProvider } from "#/providers/github";

// -----
// The only file that may import every provider. A new
// provider is one folder under src/providers and one
// line here.
// -----
export const SOURCE_PROVIDERS = {
  github: githubProvider,
} as const satisfies Readonly<Record<string, SourceProvider>>;

export type SourceProviderId = keyof typeof SOURCE_PROVIDERS;

export const DEFAULT_SOURCE_PROVIDER_ID = "github" satisfies SourceProviderId;

export const sourceProviderOf = (id: SourceProviderId): SourceProvider => SOURCE_PROVIDERS[id];
