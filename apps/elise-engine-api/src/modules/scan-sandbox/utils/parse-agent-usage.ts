import { z } from "zod";
import { RUNNER_JOB_PHASE_VALUES, type ScanPhaseUsage, type ScanUsage } from "@repo/contracts/elise";
import { sumOrNull } from "./meter";

const Count = z.number().int().min(0).catch(0);

// -----
// The final `result` line of `claude --print --output-format
// stream-json --verbose`, which has the fields of the old single
// JSON result.
// Every field is optional: a missing one counts as zero.
// -----
const AgentResultSchema = z.object({
  type: z.string().optional(),
  total_cost_usd: z.number().min(0).optional(),
  num_turns: z.number().int().min(0).optional(),
  duration_ms: z.number().int().min(0).optional(),
  usage: z
    .object({
      input_tokens: Count.optional(),
      output_tokens: Count.optional(),
      cache_read_input_tokens: Count.optional(),
      cache_creation_input_tokens: Count.optional(),
    })
    .optional(),
});

const usageOf = ({ usage, total_cost_usd, num_turns, duration_ms }: z.infer<typeof AgentResultSchema>): ScanUsage => ({
  inputTokens: usage?.input_tokens ?? 0,
  outputTokens: usage?.output_tokens ?? 0,
  cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
  cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
  costUsd: total_cost_usd ?? 0,
  turns: num_turns ?? null,
  durationMs: duration_ms ?? null,
});

const parseResult = (text: string) => {
  try {
    return AgentResultSchema.safeParse(JSON.parse(text));
  } catch {
    return null;
  }
};

// -----
// The log is one JSON object per line, the report last. A stray
// line is skipped: the last line that starts with "{" wins.
// -----
export const parseAgentUsage = (log: string): ScanUsage | null => {
  const lastObjectLine = log
    .trim()
    .split("\n")
    .findLast((line) => line.startsWith("{"));
  const parsed = parseResult(log.trim()) ?? (lastObjectLine ? parseResult(lastObjectLine) : null);
  if (!parsed?.success || (parsed.data.usage === undefined && parsed.data.total_cost_usd === undefined)) return null;
  return usageOf(parsed.data);
};

const PHASE_COST_TOLERANCE_USD = 0.001;

const addUsage = (a: ScanUsage, b: ScanUsage): ScanUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  costUsd: a.costUsd + b.costUsd,
  turns: sumOrNull([a.turns, b.turns]),
  durationMs: sumOrNull([a.durationMs, b.durationMs]),
});

export const parseAgentPhases = (log: string): ScanPhaseUsage[] | null => {
  const results = log
    .trim()
    .split("\n")
    .flatMap((line) => {
      const parsed = line.startsWith("{") ? parseResult(line) : null;
      return parsed?.success && parsed.data.type === "result" ? [usageOf(parsed.data)] : [];
    });
  const total = results.at(-1);
  const runs = results.slice(0, -1);
  if (total === undefined || runs.length === 0) return null;
  const phases = RUNNER_JOB_PHASE_VALUES.flatMap((phase, index) => {
    const own = index === RUNNER_JOB_PHASE_VALUES.length - 1 ? runs.slice(index) : runs.slice(index, index + 1);
    return own.length === 0 ? [] : [{ ...own.reduce(addUsage), phase }];
  });
  const spent = phases.reduce((sum, phase) => sum + phase.costUsd, 0);
  return Math.abs(spent - total.costUsd) <= PHASE_COST_TOLERANCE_USD ? phases : null;
};
