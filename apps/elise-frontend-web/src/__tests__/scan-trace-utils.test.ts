import { describe, expect, it } from "vitest";
import type { TraceEntry } from "#/modules/scan/schemas";
import { groupTraceByPhase, tallyTraceLabels } from "#/modules/scan/utils/scan-trace";

const at = "2026-11-19T03:00:00.000Z";

function entry(id: string, label: TraceEntry["label"], phase: TraceEntry["phase"], count = 1): TraceEntry {
  return { id, label, phase, startedAt: at, endedAt: at, count };
}

describe("tallyTraceLabels", () => {
  it("counts a merged entry as its repeats and leaves out the Phase markers", () => {
    const entries = [
      entry("a", "phase_started", "hunt"),
      entry("b", "reading_files", "hunt", 5),
      entry("c", "reasoning", "hunt"),
      entry("d", "reading_files", "hunt", 2),
      entry("e", "phase_ended", "hunt"),
    ];
    expect(tallyTraceLabels(entries)).toEqual([
      { label: "reasoning", count: 1 },
      { label: "reading_files", count: 7 },
    ]);
  });
});

describe("groupTraceByPhase", () => {
  it("starts a new group when the Phase changes, newest first", () => {
    const groups = groupTraceByPhase([entry("a", "reasoning", "hunt"), entry("b", "writing", "hunt"), entry("c", "reasoning", "recon")]);
    expect(groups.map((group) => [group.title, group.entries.length])).toEqual([
      ["Hunt", 2],
      ["Recon", 1],
    ]);
  });
});
