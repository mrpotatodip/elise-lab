// -----
// The one shape the dashboard knows a source provider by
// (docs/adr/0007-git-providers.md). Modules read a provider
// only through this port and the registry, never by
// importing the provider's folder.
// -----
export type SourceProviderCapabilities = {
  canListRepos: boolean;
  hasBranches: boolean;
  isArchive: boolean;
};

export type SourceProviderLink = { url: string; label: string };

export type SourceProvider = {
  id: string;
  label: string;
  capabilities: SourceProviderCapabilities;
  addressPattern: RegExp;
  addressMessage: string;
  addressExample: string;
  linkOf: (text: string) => SourceProviderLink | null;
  pathOf: (address: string) => string;
};
