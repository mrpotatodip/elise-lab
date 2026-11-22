import type { SourceArchivePick } from "#/providers/port";
import { DEFAULT_SOURCE_PROVIDER_ID, isGitSourceProvider, sourceProviderOf } from "#/providers/registry";
import type { SourceProviderValue } from "../schemas";
import type { KnownRepo } from "./scan-known-repos";

// -----
// What the new-scan search lists for the chosen provider: every repository of
// that provider the account can scan, with where its branches come from. A
// repository the account scanned before reads its branches from the engine;
// a pasted link has no list, so the branch is typed.
// -----
export type ScanRepoPick = {
  provider: SourceProviderValue;
  url: string;
  label: string;
  note: string;
  isPrivate: boolean;
  running: boolean;
  repoId: string | null;
  fromLink: boolean;
  archive?: { id: string; label: string };
};

// -----
// An upload app's choice as a pick: the app, with the one zip
// the Scan reads. It has no branches.
// -----
export function scanArchivePick(pick: SourceArchivePick): ScanRepoPick {
  return {
    provider: "upload",
    url: pick.repo,
    label: pick.appName,
    note: pick.archiveLabel,
    isPrivate: false,
    running: false,
    repoId: pick.repoId,
    fromLink: false,
    archive: { id: pick.archiveId, label: pick.archiveLabel },
  };
}

const LAST_SCAN_NOTE = {
  none: "Not scanned yet",
  queued: "A scan is waiting to start",
  running: "A scan is running now",
  succeeded: "Last scan succeeded",
  failed: "Last scan failed",
  stopped: "Last scan was stopped",
} as const;

const bare = (url: string) => url.toLowerCase().replace(/(\.git)?\/?$/, "");

export const scanRepoPickSame = (a: string, b: string) => bare(a) === bare(b);
const sameRepo = scanRepoPickSame;

export function scanRepoLinkPick(text: string, providerId: SourceProviderValue = DEFAULT_SOURCE_PROVIDER_ID): ScanRepoPick | null {
  const provider = sourceProviderOf(providerId);
  if (!provider.available || !isGitSourceProvider(provider)) return null;
  const link = provider.address.linkOf(text);
  if (link === null || !provider.address.pattern.test(link.url)) return null;
  return { provider: providerId, url: link.url, label: link.label, note: provider.address.linkNote, isPrivate: false, running: false, repoId: null, fromLink: true };
}

export function scanRepoPicks(known: readonly KnownRepo[], providerId: SourceProviderValue = DEFAULT_SOURCE_PROVIDER_ID): ScanRepoPick[] {
  return known
    .filter((item) => item.provider === providerId)
    .map((item): ScanRepoPick => {
      const note = LAST_SCAN_NOTE[item.running ? "running" : (item.last ?? "none")];
      return { provider: providerId, url: item.url, label: item.label, note, isPrivate: item.isPrivate, running: item.running, repoId: item.repoId, fromLink: false };
    });
}

export function scanRepoPickMatches(picks: readonly ScanRepoPick[], query: string, providerId: SourceProviderValue = DEFAULT_SOURCE_PROVIDER_ID): ScanRepoPick[] {
  const needle = query.trim().toLowerCase();
  const found = needle === "" ? [...picks] : picks.filter((item) => item.label.toLowerCase().includes(needle));
  const link = scanRepoLinkPick(query, providerId);
  if (link === null) return found;
  const same = picks.find((item) => sameRepo(item.url, link.url));
  return same === undefined ? [link, ...found] : [same, ...found.filter((item) => item !== same)];
}
