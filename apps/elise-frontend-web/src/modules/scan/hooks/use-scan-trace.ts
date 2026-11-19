import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRACE_POLL_MS } from "../constants";
import { fetchScanTrace } from "../api";
import type { TraceEntry } from "../schemas";
import { scanKeys } from "./scan-queries";

export type ScanTraceData = {
  entries: TraceEntry[];
  cursor: string | null;
  candidateFindings: number | null;
  offsetMs: number;
  changedAt: number;
};

const newestFirst = (a: TraceEntry, b: TraceEntry) => {
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
};

export function useScanTrace(scanId: string, active: boolean) {
  const queryClient = useQueryClient();
  const key = [...scanKeys.detail(scanId), "trace"] as const;
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<ScanTraceData> => {
      const before = queryClient.getQueryData<ScanTraceData>(key);
      const trace = await fetchScanTrace({ data: { scanId, after: before?.cursor ?? undefined } });
      const received = Date.now();
      const byId = new Map((before?.entries ?? []).map((entry) => [entry.id, entry]));
      const changed = trace.entries.some((entry) => {
        const had = byId.get(entry.id);
        return had === undefined || had.count !== entry.count || had.endedAt !== entry.endedAt;
      });
      for (const entry of trace.entries) byId.set(entry.id, entry);
      return {
        entries: [...byId.values()].toSorted(newestFirst),
        cursor: trace.cursor ?? before?.cursor ?? null,
        candidateFindings: trace.candidateFindings ?? before?.candidateFindings ?? null,
        offsetMs: trace.now ? new Date(trace.now).getTime() - received : (before?.offsetMs ?? 0),
        changedAt: changed || before === undefined ? received : before.changedAt,
      };
    },
    refetchInterval: active ? TRACE_POLL_MS : false,
    refetchOnWindowFocus: false,
  });
}
