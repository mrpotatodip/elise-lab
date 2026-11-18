import type { SourceProvider } from "#/providers/port";

const GITHUB_ADDRESS = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/;
const GITHUB_PREFIX = /^https:\/\/github\.com\//;
const GIT_SUFFIX = /(\.git)?\/?$/;

// -----
// canonical: the same repo, however it was typed:
// owner/name in lowercase, without the host, .git or
// a trailing slash. Twin of the SQL in migration
// 0058_scan_repos. display: the URL as first typed,
// minus .git and a trailing slash.
// -----
export const githubProvider = {
  id: "github",
  capabilities: { canListRepos: true, hasBranches: true, isArchive: false, cloudScans: true },
  addressPattern: GITHUB_ADDRESS,
  addressMessage: "A GitHub address looks like https://github.com/owner/name",
  fixedBranch: null,
  host: (): string => "github.com",
  canonical: (address: string): string => address.replace(GITHUB_PREFIX, "").replace(GIT_SUFFIX, "").toLowerCase(),
  display: (address: string): string => address.replace(GIT_SUFFIX, ""),
} as const satisfies SourceProvider;
