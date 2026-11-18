import { DEFAULT_SOURCE_PROVIDER_ID, sourceProviderOf } from "#/providers/registry";

const provider = sourceProviderOf(DEFAULT_SOURCE_PROVIDER_ID);

export function scanRepoName(repo: string | null | undefined, fallback: string) {
  const path = repo ? provider.pathOf(repo) : "";
  if (!path) return { owner: "", name: fallback };
  const [owner = "", ...rest] = path.split("/");
  return { owner, name: rest.join("/") };
}
