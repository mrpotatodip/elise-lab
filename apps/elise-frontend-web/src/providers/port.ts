import type { ComponentType } from "react";
import type { SourceProviderValue } from "@repo/contracts/elise";

// -----
// The one shape the dashboard knows a source provider by
// (docs/adr/0008-git-providers.md). Modules read a provider
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
// What an archive provider (upload) hands the new-scan form:
// the app the Scan belongs to, by its address and id, and the
// one zip the Scan reads, by id.
// -----
export type SourceArchivePick = {
  repo: string;
  repoId: string;
  appName: string;
  archiveId: string;
  archiveLabel: string;
};

export type SourceArchivePickerProps = { startRepoId?: string; onPick: (pick: SourceArchivePick) => void };

// -----
// The provider's own part of a Repo page: an upload app's zips,
// with upload and remove.
// -----
export type SourceRepoPanelProps = { repoId: string };

// -----
// available: the provider's flow is built, so the picker
// lets the person choose it. address is null for a provider
// that is not a git host (an upload app). Help is the
// provider's own screen under the search, if it has one.
// ArchivePicker replaces the search for an archive provider,
// and RepoPanel adds to its Repo page.
// -----
export type SourceProvider = {
  id: SourceProviderValue;
  label: string;
  available: boolean;
  capabilities: SourceProviderCapabilities;
  address: SourceProviderAddress | null;
  Help: ComponentType | null;
  ArchivePicker: ComponentType<SourceArchivePickerProps> | null;
  RepoPanel: ComponentType<SourceRepoPanelProps> | null;
};

export type GitSourceProvider = SourceProvider & { address: SourceProviderAddress };
