import type { ComponentType } from "react";
import type { SourceProviderValue } from "@repo/contracts/elise";

// -----
// The one shape the dashboard knows a source provider by
// (docs/adr/0007-git-providers.md). Modules read a provider
// only through this port and the registry, never by
// importing the provider's folder. cloudScans: a Scan may
// run in Elise's cloud; without it a Scan runs only on a
// Runner, which clones with the person's own git login.
// -----
export type SourceProviderCapabilities = {
  canListRepos: boolean;
  hasBranches: boolean;
  isArchive: boolean;
  cloudScans: boolean;
};

export type SourceProviderLink = { url: string; label: string };

// -----
// How a git provider reads a pasted address. linkOf reads
// loosely (no scheme, a branch view) and answers the clean
// address; pattern is the strict check the engine also runs.
// nameOf is how a screen names the repository: its path, with
// the host in front when the provider has many hosts.
// The copy is what the new-scan search says for this provider.
// -----
export type SourceProviderAddress = {
  pattern: RegExp;
  message: string;
  example: string;
  linkOf: (text: string) => SourceProviderLink | null;
  nameOf: (address: string) => string;
  searchPlaceholder: string;
  emptyNote: string;
  linkNote: string;
  repoNote: string;
};

// -----
// available: the provider's flow is built, so the picker
// lets the person choose it. address is null for a provider
// that is not a git host (an upload app). Help is the
// provider's own screen under the search, if it has one.
// -----
export type SourceProvider = {
  id: SourceProviderValue;
  label: string;
  available: boolean;
  capabilities: SourceProviderCapabilities;
  address: SourceProviderAddress | null;
  Help: ComponentType | null;
};

export type GitSourceProvider = SourceProvider & { address: SourceProviderAddress };
