import type { GitSourceProvider, SourceProviderLink } from "#/providers/port";

const GITHUB_ADDRESS = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/;
const GITHUB_PREFIX = "https://github.com/";

// -----
// A pasted link is read loosely: no scheme, http or
// www still name the repository.
// -----
const GITHUB_LINK = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;

function githubLinkOf(text: string): SourceProviderLink | null {
  const match = GITHUB_LINK.exec(text.trim());
  if (!match) return null;
  return { url: `${GITHUB_PREFIX}${match[1]}/${match[2]}`, label: `${match[1]}/${match[2]}` };
}

export const githubProvider = {
  id: "github",
  label: "GitHub",
  available: true,
  capabilities: { canListRepos: true, hasBranches: true, isArchive: false, cloudScans: true },
  address: {
    pattern: GITHUB_ADDRESS,
    message: "That doesn't look like a GitHub repository link. Use the form https://github.com/owner/name.",
    example: "https://github.com/owner/name",
    linkOf: githubLinkOf,
    nameOf: (address: string) => address.replace(GITHUB_PREFIX, "").replace(/\.git$/, "").replace(/\/$/, ""),
    searchPlaceholder: "Search your repositories or paste a GitHub link",
    emptyNote: "Paste the link to a public GitHub repository to scan it.",
    linkNote: "Public repository, from the link",
    repoNote: "Public repository",
  },
  Help: null,
  ArchivePicker: null,
  RepoPanel: null,
} as const satisfies GitSourceProvider;
