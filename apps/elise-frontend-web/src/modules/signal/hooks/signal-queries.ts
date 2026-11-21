import { queryOptions } from "@tanstack/react-query";
import { fetchSignals, fetchSignalsSettings } from "../api";

export const signalKeys = {
  all: ["signals"] as const,
  settings: () => [...signalKeys.all, "settings"] as const,
  repo: (repo: string) => [...signalKeys.all, "repo", repo] as const,
};

export const signalsSettingsQuery = () =>
  queryOptions({
    queryKey: signalKeys.settings(),
    queryFn: () => fetchSignalsSettings(),
  });

export const signalsQuery = (repo: string) =>
  queryOptions({
    queryKey: signalKeys.repo(repo),
    queryFn: () => fetchSignals({ data: { repo } }),
  });
