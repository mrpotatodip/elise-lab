import type { SourceProviderValue } from "@repo/contracts/elise";

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

// -----
// A Repo is known by (id, host(address), canonical(address)).
// host is lowercase, and null for a provider with no host
// (an upload app). fixedBranch is the one hidden Branch of
// a provider without branches (upload), so its Scans share
// one History; null for a git host.
// -----
export type SourceProvider = {
  id: SourceProviderValue;
  capabilities: SourceProviderCapabilities;
  addressPattern: RegExp;
  fixedBranch: string | null;
  host: (address: string) => string | null;
  canonical: (address: string) => string;
  display: (address: string) => string;
};
