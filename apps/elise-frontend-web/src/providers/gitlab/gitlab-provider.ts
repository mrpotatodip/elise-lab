import { GITLAB_ADDRESS_MESSAGE, GITLAB_ADDRESS_PATTERN, GitlabAddressSchema } from "@repo/contracts/elise";
import type { GitSourceProvider, SourceProviderLink } from "#/providers/port";
import { GitlabScanHelp } from "./gitlab-scan-help";

const SCHEME = /^(?:https?:\/\/)?/i;

// -----
// gitlab.com, groups inside groups. A pasted link is read
// loosely: no scheme or http still name the repository, and
// a branch view or a trailing .git is cut off. The path keeps
// the case it was typed in.
// -----
function gitlabLinkOf(text: string): SourceProviderLink | null {
  const parsed = GitlabAddressSchema.safeParse(text.trim().replace(SCHEME, "https://"));
  if (!parsed.success) return null;
  return { url: `https://gitlab.com/${parsed.data.path}`, label: parsed.data.path };
}

export const gitlabProvider = {
  id: "gitlab",
  label: "GitLab",
  available: true,
  capabilities: { canListRepos: false, hasBranches: true, isArchive: false, cloudScans: false },
  address: {
    pattern: GITLAB_ADDRESS_PATTERN,
    message: GITLAB_ADDRESS_MESSAGE,
    example: "https://gitlab.com/group/name",
    linkOf: gitlabLinkOf,
    nameOf: (address: string) => {
      const parsed = GitlabAddressSchema.safeParse(address);
      return parsed.success ? parsed.data.path : "";
    },
    searchPlaceholder: "Search your repositories or paste a GitLab link",
    emptyNote: "Paste the link to a gitlab.com repository to scan it.",
    linkNote: "GitLab repository, from the link",
    repoNote: "GitLab repository, scanned on your Runner",
  },
  Help: GitlabScanHelp,
} as const satisfies GitSourceProvider;
