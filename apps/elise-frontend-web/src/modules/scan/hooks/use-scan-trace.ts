import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRACE_POLL_MS } from "../constants";
import { fetchScanTrace } from "../api";
import type { TraceEntry } from "../schemas";
import { scanKeys } from "./scan-queries";

export type ScanTraceData = {
  entries: TraceEntry[];
  cursor: string | null;
  candidateFindings: number | null;
};

const newestFirst = (a: TraceEntry, b: TraceEntry) => {
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
};

// -----
// Reads a Scan's Trace. Each read sends the cursor of the one before and
// replaces an entry it already has by id, so an entry that grew updates in
// place. While the Scan runs it reads every 5 seconds; when the Scan ends
// the page's refresh-on-finish reads it one last time.
// -----
export function useScanTrace(scanId: string, active: boolean) {
  const queryClient = useQueryClient();
  const key = [...scanKeys.detail(scanId), "trace"] as const;
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<ScanTraceData> => {
      const before = queryClient.getQueryData<ScanTraceData>(key);
      const trace = await fetchScanTrace({ data: { scanId, after: before?.cursor ?? undefined } });
      const byId = new Map((before?.entries ?? []).map((entry) => [entry.id, entry]));
      for (const entry of trace.entries) byId.set(entry.id, entry);
      return {
        entries: [...byId.values()].toSorted(newestFirst),
        cursor: trace.cursor ?? before?.cursor ?? null,
        candidateFindings: trace.candidateFindings ?? before?.candidateFindings ?? null,
      };
    },
    refetchInterval: active ? TRACE_POLL_MS : false,
    refetchOnWindowFocus: false,
  });
}
