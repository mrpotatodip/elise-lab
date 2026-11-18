import type { GithubRepo } from "#/modules/github";
import { DEFAULT_SOURCE_PROVIDER_ID, isGitSourceProvider, sourceProviderOf } from "#/providers/registry";
import type { SourceProviderValue } from "../schemas";
import type { KnownRepo } from "./scan-known-repos";

// -----
// What the new-scan search lists for the chosen provider: every repository of
// that provider the account can scan, with where its branches come from. A
// repository the account scanned before reads its branches from the engine;
// one a GitHub connection can read reads them from GitHub; a pasted link has
// no list, so the branch is typed. Only a provider that can list repositories
// (github) adds the connection's.
// -----
export type ScanRepoPick = {
  provider: SourceProviderValue;
  url: string;
  label: string;
  note: string;
  isPrivate: boolean;
  running: boolean;
  repoId: string | null;
  connection: GithubRepo | null;
  fromLink: boolean;
};

const LAST_SCAN_NOTE = {
  none: "Not scanned yet",
  queued: "A scan is waiting to start",
  running: "A scan is running now",
  succeeded: "Last scan succeeded",
  failed: "Last scan failed",
} as const;

const bare = (url: string) => url.toLowerCase().replace(/(\.git)?\/?$/, "");

export const scanRepoPickSame = (a: string, b: string) => bare(a) === bare(b);
const sameRepo = scanRepoPickSame;

export function scanRepoLinkPick(text: string, providerId: SourceProviderValue = DEFAULT_SOURCE_PROVIDER_ID): ScanRepoPick | null {
  const provider = sourceProviderOf(providerId);
  if (!provider.available || !isGitSourceProvider(provider)) return null;
  const link = provider.address.linkOf(text);
  if (link === null || !provider.address.pattern.test(link.url)) return null;
  return { provider: providerId, url: link.url, label: link.label, note: provider.address.linkNote, isPrivate: false, running: false, repoId: null, connection: null, fromLink: true };
}

export function scanRepoPicks(known: readonly KnownRepo[], connected: readonly GithubRepo[], providerId: SourceProviderValue = DEFAULT_SOURCE_PROVIDER_ID): ScanRepoPick[] {
  const listed = sourceProviderOf(providerId).capabilities.canListRepos ? connected : [];
  const connectionOf = (url: string) => listed.find((item) => sameRepo(item.url, url)) ?? null;
  const own = known.filter((item) => item.provider === providerId);
  const scanned = own.flatMap((item): ScanRepoPick[] => {
    const connection = connectionOf(item.url);
    if (item.isPrivate && connection === null) return [];
    const note = LAST_SCAN_NOTE[item.running ? "running" : (item.last ?? "none")];
    return [{ provider: providerId, url: item.url, label: item.label, note, isPrivate: item.isPrivate || connection?.private === true, running: item.running, repoId: item.repoId, connection, fromLink: false }];
  });
  const connectedOnly = listed
    .filter((item) => !own.some((seen) => sameRepo(seen.url, item.url)))
    .map((item): ScanRepoPick => ({ provider: providerId, url: item.url, label: item.fullName, note: item.private ? "Private, connected on GitHub" : "Connected on GitHub", isPrivate: item.private, running: false, repoId: null, connection: item, fromLink: false }));
  return [...scanned, ...connectedOnly];
}

export function scanRepoPickMatches(picks: readonly ScanRepoPick[], query: string, providerId: SourceProviderValue = DEFAULT_SOURCE_PROVIDER_ID): ScanRepoPick[] {
  const needle = query.trim().toLowerCase();
  const found = needle === "" ? [...picks] : picks.filter((item) => item.label.toLowerCase().includes(needle));
  const link = scanRepoLinkPick(query, providerId);
  if (link === null) return found;
  const same = picks.find((item) => sameRepo(item.url, link.url));
  return same === undefined ? [link, ...found] : [same, ...found.filter((item) => item !== same)];
}
