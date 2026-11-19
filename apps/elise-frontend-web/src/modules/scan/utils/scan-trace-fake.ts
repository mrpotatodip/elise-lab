import type { RunnerJobPhaseValue, TraceLabelValue } from "@repo/contracts/elise";
import type { TraceEntry } from "../schemas";

// -----
// Made-up Trace data for the /dev/trace preview, so the panel can be
// designed without running a Scan. The same seed gives the same Scan every
// time. The timeline is fixed (offsets from the start); a state of the
// preview is just "how far along is it": the entries that had started by
// then, newest first, with the last one still growing.
// -----

type Step = { phase: RunnerJobPhaseValue; label: TraceLabelValue; count: number; startMs: number; endMs: number };

const PHASE_PLAN: { phase: RunnerJobPhaseValue; entries: number; seconds: number }[] = [
  { phase: "recon", entries: 34, seconds: 210 },
  { phase: "hunt", entries: 84, seconds: 520 },
  { phase: "check", entries: 46, seconds: 260 },
  { phase: "report", entries: 18, seconds: 90 },
];

const WORK_LABELS: TraceLabelValue[] = ["reading_files", "searching", "running_command", "writing", "calling_tool"];

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTimeline(): Step[] {
  const random = seeded(238);
  const steps: Step[] = [];
  let clock = 0;
  for (const plan of PHASE_PLAN) {
    steps.push({ phase: plan.phase, label: "phase_started", count: 1, startMs: clock, endMs: clock });
    const slot = (plan.seconds * 1000) / plan.entries;
    for (let i = 0; i < plan.entries; i += 1) {
      const reasoning = i % 2 === 0;
      const label = reasoning ? "reasoning" : (WORK_LABELS[Math.floor(random() * WORK_LABELS.length)] ?? "reading_files");
      const count = reasoning ? 1 : 1 + Math.floor(random() * (label === "reading_files" ? 8 : 3));
      const startMs = clock + 1000 + Math.round(slot * i * (0.9 + random() * 0.2));
      steps.push({ phase: plan.phase, label, count, startMs, endMs: startMs + Math.round(slot * (0.4 + random() * 0.5)) });
    }
    clock += plan.seconds * 1000;
    steps.push({ phase: plan.phase, label: "phase_ended", count: 1, startMs: clock, endMs: clock });
  }
  return steps;
}

const TIMELINE = buildTimeline();

export const FAKE_TRACE_TOTAL_MS = TIMELINE.at(-1)?.endMs ?? 0;

function fakeId(index: number) {
  return `01900000-0000-7000-8000-${index.toString(16).padStart(12, "0")}`;
}

// -----
// The entries the Scan would have by `elapsedMs`, newest first. The one in
// progress is cut at elapsedMs, as a live entry that is still growing.
// -----
export function fakeTraceAt(elapsedMs: number, startedAtMs: number): TraceEntry[] {
  const entries: TraceEntry[] = [];
  TIMELINE.forEach((step, index) => {
    if (step.startMs > elapsedMs) return;
    const end = Math.min(step.endMs, elapsedMs);
    entries.push({
      id: fakeId(index),
      label: step.label,
      phase: step.phase,
      startedAt: new Date(startedAtMs + step.startMs).toISOString(),
      endedAt: new Date(startedAtMs + end).toISOString(),
      count: step.endMs > elapsedMs && step.count > 1 ? Math.max(1, Math.ceil((step.count * (end - step.startMs)) / (step.endMs - step.startMs))) : step.count,
    });
  });
  return entries.toReversed();
}
