import { queryOptions } from "@tanstack/react-query";
import { fetchSignalsSettings } from "../api";

export const signalKeys = {
  all: ["signals"] as const,
  settings: () => [...signalKeys.all, "settings"] as const,
};

export const signalsSettingsQuery = () =>
  queryOptions({
    queryKey: signalKeys.settings(),
    queryFn: () => fetchSignalsSettings(),
  });
