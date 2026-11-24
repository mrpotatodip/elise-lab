import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchFindingThread } from "../api";

export const findingCommentKeys = {
  all: ["finding-comments"] as const,
  thread: (repo: string, fingerprint: string) => [...findingCommentKeys.all, "thread", repo, fingerprint] as const,
};

export const findingThreadQuery = (repo: string, fingerprint: string) =>
  queryOptions({
    queryKey: findingCommentKeys.thread(repo, fingerprint),
    queryFn: () => fetchFindingThread({ data: { repo, fingerprint } }),
  });

export const useFindingThread = (repo: string, fingerprint: string) => useQuery(findingThreadQuery(repo, fingerprint));
