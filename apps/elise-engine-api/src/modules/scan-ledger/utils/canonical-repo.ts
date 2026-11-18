import { and, eq, isNull, type SQL } from "drizzle-orm";
import { scanRepos } from "@repo/db-elise/schema";
import { DEFAULT_SOURCE_PROVIDER_ID, sourceProviderOf, type SourceProviderId } from "#/providers/registry";

const provider = sourceProviderOf(DEFAULT_SOURCE_PROVIDER_ID);

// -----
// The addresses that reach these two without a provider
// (findings, comments, GitHub access) are github ones.
// -----
export const canonicalRepo = (url: string): string => provider.canonical(url);

export const displayRepoUrl = (url: string): string => provider.display(url);

// -----
// A Repo is known by (provider, host, canonical), read
// by the provider's own parser. A request without a
// provider is a github one.
// -----
export type RepoIdentity = { provider: SourceProviderId; host: string | null; canonical: string };

export const repoIdentityOf = (url: string, id: SourceProviderId = DEFAULT_SOURCE_PROVIDER_ID): RepoIdentity => {
  const parser = sourceProviderOf(id);
  return { provider: id, host: parser.host(url), canonical: parser.canonical(url) };
};

export const displayRepoUrlOf = (url: string, id: SourceProviderId = DEFAULT_SOURCE_PROVIDER_ID): string => sourceProviderOf(id).display(url);

// -----
// The filter for one Repo of an Account. A null host
// (an upload app) is matched with IS NULL, as the
// unique constraint treats nulls as equal.
// -----
export const sameRepoIdentity = (accountId: string, identity: RepoIdentity): SQL | undefined =>
  and(
    eq(scanRepos.tenantId, accountId),
    eq(scanRepos.provider, identity.provider),
    identity.host === null ? isNull(scanRepos.host) : eq(scanRepos.host, identity.host),
    eq(scanRepos.canonical, identity.canonical),
  );
