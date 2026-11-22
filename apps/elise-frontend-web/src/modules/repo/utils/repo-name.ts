import { sourceProviderOfAddress } from "#/providers/registry";

// -----
// A Repo's name on screen, read by the provider its address
// belongs to. An address no provider knows shows as it is.
// -----
export const repoName = (url: string) => sourceProviderOfAddress(url)?.address.nameOf(url) || url;
