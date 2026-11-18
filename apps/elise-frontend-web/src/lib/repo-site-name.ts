const HOST = /^https?:\/\/([^/?#]+)/i;

// -----
// The name of the site a repository address points at, for a link that
// says where it opens: GitHub, GitLab, or the host of a company GitLab
// server. An address with no host reads as the code host in general.
// -----
export function repoSiteName(repoUrl: string): string {
  const host = HOST.exec(repoUrl)?.[1]?.toLowerCase();
  if (host === undefined) return "the code host";
  if (host === "github.com") return "GitHub";
  if (host === "gitlab.com") return "GitLab";
  return host;
}
