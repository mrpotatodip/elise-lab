// -----
// The one shape core knows a source provider by
// (docs/adr/0007-git-providers.md). Core reads a
// provider only through this port and the registry,
// never by importing the provider's folder.
// -----
export type SourceProviderCapabilities = {
  canListRepos: boolean;
  hasBranches: boolean;
  isArchive: boolean;
};

export type SourceProvider = {
  id: string;
  capabilities: SourceProviderCapabilities;
  addressPattern: RegExp;
  canonical: (address: string) => string;
  display: (address: string) => string;
};
