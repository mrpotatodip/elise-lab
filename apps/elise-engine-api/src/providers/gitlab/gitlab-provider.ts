import { GITLAB_ADDRESS_MESSAGE, GITLAB_ADDRESS_PATTERN, GitlabAddressSchema } from "@repo/contracts/elise";
import type { SourceProvider } from "#/providers/port";

// -----
// gitlab.com, groups inside groups. Scans run only on a
// Runner: EliseLAB holds no GitLab token (ADR 0007).
// canonical is the path in lowercase, as GitLab matches
// paths without case. display is the clean address,
// without a branch view, .git or a trailing slash.
// -----
export const gitlabProvider = {
  id: "gitlab",
  capabilities: { canListRepos: false, hasBranches: true, isArchive: false, cloudScans: false },
  addressPattern: GITLAB_ADDRESS_PATTERN,
  addressMessage: GITLAB_ADDRESS_MESSAGE,
  fixedBranch: null,
  host: (address: string): string => GitlabAddressSchema.parse(address).host,
  canonical: (address: string): string => GitlabAddressSchema.parse(address).path.toLowerCase(),
  display: (address: string): string => {
    const { host, path } = GitlabAddressSchema.parse(address);
    return `https://${host}/${path}`;
  },
} as const satisfies SourceProvider;
