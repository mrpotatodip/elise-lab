import { GITLAB_SH_ADDRESS_MESSAGE, GITLAB_SH_ADDRESS_PATTERN, GitlabShAddressSchema } from "@repo/contracts/elise";
import type { SourceProvider } from "#/providers/port";

// -----
// A GitLab server a company runs. The engine takes any plain
// host but github.com and gitlab.com; the Runner clones only
// from a host listed in its own settings, so a host named
// here alone never reaches git. Scans run only on a Runner.
// -----
export const gitlabShProvider = {
  id: "gitlab-sh",
  capabilities: { canListRepos: false, hasBranches: true, isArchive: false, cloudScans: false },
  addressPattern: GITLAB_SH_ADDRESS_PATTERN,
  addressMessage: GITLAB_SH_ADDRESS_MESSAGE,
  fixedBranch: null,
  host: (address: string): string => GitlabShAddressSchema.parse(address).host,
  canonical: (address: string): string => GitlabShAddressSchema.parse(address).path.toLowerCase(),
  display: (address: string): string => {
    const { host, path } = GitlabShAddressSchema.parse(address);
    return `https://${host}/${path}`;
  },
} as const satisfies SourceProvider;
