import { sourceProviderOfAddress } from "#/providers/registry";

// -----
// The repository's name, read by the provider its address
// belongs to. A GitLab path may hold groups inside groups,
// so the name is the last part and the owner the rest. An
// upload app's address is its name, which no git provider
// reads, so it shows as it is.
// -----
export function scanRepoName(repo: string | null | undefined, fallback: string) {
  const path = repo ? (sourceProviderOfAddress(repo)?.address.nameOf(repo) ?? repo) : "";
  if (!path) return { owner: "", name: fallback };
  const cut = path.lastIndexOf("/");
  return cut === -1 ? { owner: "", name: path } : { owner: path.slice(0, cut), name: path.slice(cut + 1) };
}
