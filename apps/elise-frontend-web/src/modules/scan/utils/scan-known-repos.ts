import { DEFAULT_SOURCE_PROVIDER_ID, sourceProviderOfAddress } from "#/providers/registry";
import type { Repo, ScanState, ScanStatus, SourceProviderValue } from "../schemas";
import { scanRepoName } from "./scan-repo-name";

export type KnownRepo = {
  provider: SourceProviderValue;
  repoId: string;
  url: string;
  label: string;
  last: ScanState | null;
  running: boolean;
  isPrivate: boolean;
};

// -----
// The repositories this account has already scanned, newest scan first, one
// row each. A repository counts as running when any of its scans is queued or
// running, because the engine allows one active scan per repository.
// -----
export function scanKnownRepos(scans: readonly ScanStatus[]): KnownRepo[] {
  const known = new Map<string, KnownRepo>();
  for (const scan of scans) {
    const active = scan.status === "queued" || scan.status === "running";
    const seen = known.get(scan.repoId);
    if (seen) {
      seen.running ||= active;
      continue;
    }
    const { owner, name } = scanRepoName(scan.repo, scan.repoId);
    // -----
    // A scan names no provider, so its address tells.
    // -----
    const provider = sourceProviderOfAddress(scan.repo)?.id ?? DEFAULT_SOURCE_PROVIDER_ID;
    known.set(scan.repoId, { provider, repoId: scan.repoId, url: scan.repo, label: owner ? `${owner}/${name}` : name, last: scan.status, running: active, isPrivate: false });
  }
  return [...known.values()];
}

// -----
// The account's repositories for the new-scan list: the ones used most
// recently first, then the ones never scanned by name. The running flag
// still comes from the scans, which the list of repositories does not carry.
// -----
export function scanRepoChoices(repos: readonly Repo[], scans: readonly ScanStatus[]): KnownRepo[] {
  const running = new Set(scans.filter((scan) => scan.status === "queued" || scan.status === "running").map((scan) => scan.repoId));
  return repos
    .toSorted((a, b) => (b.lastScanAt ?? "").localeCompare(a.lastScanAt ?? "") || a.canonical.localeCompare(b.canonical))
    .map((repo) => ({ provider: repo.provider ?? DEFAULT_SOURCE_PROVIDER_ID, repoId: repo.id, url: repo.url, label: repo.canonical, last: repo.lastScanStatus, running: running.has(repo.id), isPrivate: repo.isPrivate === true }));
}
