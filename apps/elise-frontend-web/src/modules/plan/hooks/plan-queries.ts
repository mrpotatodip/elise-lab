import { queryOptions } from "@tanstack/react-query";
import { fetchPlan, fetchPlanOffers } from "../api";

export const planKeys = {
  all: ["plan"] as const,
  offers: () => [...planKeys.all, "offers"] as const,
  details: () => [...planKeys.all, "details"] as const,
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
