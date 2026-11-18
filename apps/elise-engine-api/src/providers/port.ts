import type { SourceProviderValue } from "@repo/contracts/elise";

// -----
// The one shape core knows a source provider by
// (docs/adr/0007-git-providers.md). Core reads a
// provider only through this port and the registry,
// never by importing the provider's folder. cloudScans:
// a Scan may run in EliseLAB's cloud; without it a Scan
// runs only on a Runner, which clones with the person's
// own login.
// -----
export type SourceProviderCapabilities = {
  canListRepos: boolean;
  hasBranches: boolean;
  isArchive: boolean;
  cloudScans: boolean;
};

// -----
// A Repo is known by (id, host(address), canonical(address)).
// host is lowercase, and null for a provider with no host
// (an upload app).
// -----
export type SourceProvider = {
  id: SourceProviderValue;
  capabilities: SourceProviderCapabilities;
  addressPattern: RegExp;
  addressMessage: string;
  host: (address: string) => string | null;
  canonical: (address: string) => string;
  display: (address: string) => string;
};
