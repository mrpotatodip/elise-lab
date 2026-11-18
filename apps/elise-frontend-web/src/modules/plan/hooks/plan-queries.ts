import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { fetchCreditEntries, fetchPlan, fetchPlanOffers } from "../api";

export const planKeys = {
  all: ["plan"] as const,
  offers: () => [...planKeys.all, "offers"] as const,
  details: () => [...planKeys.all, "details"] as const,
  entries: () => [...planKeys.all, "entries"] as const,
};

export const planQuery = () =>
  queryOptions({
    queryKey: planKeys.details(),
    queryFn: () => fetchPlan(),
  });

export const planOffersQuery = () =>
  queryOptions({
    queryKey: planKeys.offers(),
    queryFn: () => fetchPlanOffers(),
  });

export const creditEntriesQuery = () =>
  infiniteQueryOptions({
    queryKey: planKeys.entries(),
    queryFn: ({ pageParam }) => fetchCreditEntries({ data: { cursor: pageParam === "" ? undefined : pageParam } }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
