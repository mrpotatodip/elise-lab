import type { SourceProvider, SourceProviderLink } from "#/providers/port";

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
  capabilities: { canListRepos: true, hasBranches: true, isArchive: false },
  addressPattern: GITHUB_ADDRESS,
  addressMessage: "That doesn't look like a GitHub repository link. Use the form https://github.com/owner/name.",
  addressExample: "https://github.com/owner/name",
  linkOf: githubLinkOf,
  pathOf: (address: string) => address.replace(GITHUB_PREFIX, "").replace(/\.git$/, "").replace(/\/$/, ""),
} as const satisfies SourceProvider;
