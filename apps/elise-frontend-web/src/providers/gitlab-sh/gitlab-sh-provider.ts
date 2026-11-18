import { GITLAB_SH_ADDRESS_MESSAGE, GITLAB_SH_ADDRESS_PATTERN, GitlabShAddressSchema } from "@repo/contracts/elise";
import type { GitSourceProvider, SourceProviderLink } from "#/providers/port";
import { GitlabShScanHelp } from "./gitlab-sh-scan-help";

const SCHEME = /^(?:https?:\/\/)?/i;

// -----
// A GitLab server a company runs: any plain host but
// github.com and gitlab.com. A pasted link is read loosely,
// as for gitlab. The label keeps the host, since two servers
// may hold the same path.
// -----
function gitlabShLinkOf(text: string): SourceProviderLink | null {
  const parsed = GitlabShAddressSchema.safeParse(text.trim().replace(SCHEME, "https://"));
  if (!parsed.success) return null;
  return { url: `https://${parsed.data.host}/${parsed.data.path}`, label: `${parsed.data.host}/${parsed.data.path}` };
}

export const gitlabShProvider = {
  id: "gitlab-sh",
  label: "GitLab server",
  available: true,
  capabilities: { canListRepos: false, hasBranches: true, isArchive: false, cloudScans: false },
  address: {
    pattern: GITLAB_SH_ADDRESS_PATTERN,
    message: GITLAB_SH_ADDRESS_MESSAGE,
    example: "https://git.example.com/group/name",
    linkOf: gitlabShLinkOf,
    nameOf: (address: string) => {
      const parsed = GitlabShAddressSchema.safeParse(address);
      return parsed.success ? `${parsed.data.host}/${parsed.data.path}` : "";
    },
    searchPlaceholder: "Search your repositories or paste a link on your GitLab server",
    emptyNote: "Paste the link to a repository on your company's GitLab server to scan it.",
    linkNote: "GitLab server repository, from the link",
    repoNote: "GitLab server repository, scanned on your Runner",
  },
  Help: GitlabShScanHelp,
  ArchivePicker: null,
  RepoPanel: null,
} as const satisfies GitSourceProvider;
