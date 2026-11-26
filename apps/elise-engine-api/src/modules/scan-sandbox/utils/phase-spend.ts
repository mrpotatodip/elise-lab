import type { FullPhase, Meter } from "#/modules/scan-sandbox/types";

export type PhaseStart = { phase: FullPhase; meter: Meter };

export type PhaseSpend = {
  phase: FullPhase;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
};

const spendBetween = (from: Meter, to: Meter) => ({
  inputTokens: Math.max(0, to.inputTokens - from.inputTokens),
  outputTokens: Math.max(0, to.outputTokens - from.outputTokens),
  cacheReadTokens: Math.max(0, to.cacheReadTokens - from.cacheReadTokens),
  cacheWriteTokens: Math.max(0, to.cacheWriteTokens - from.cacheWriteTokens),
  costUsd: Math.max(0, to.spentUsd - from.spentUsd),
});

export const phaseSpends = (starts: PhaseStart[], current: Meter): PhaseSpend[] =>
  starts.map((start, index) => ({
    phase: start.phase,
    ...spendBetween(start.meter, starts[index + 1]?.meter ?? current),
  }));
