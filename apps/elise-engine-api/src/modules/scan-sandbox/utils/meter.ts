import type { Meter } from "#/modules/scan-sandbox/types";

// -----
// The sum of the numbers that are there, or null when none is: a run
// that reported no turns has no turns, not zero.
// -----
export const sumOrNull = (values: (number | null)[]): number | null =>
  values.some((value) => value !== null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;

// -----
// The meter of a Scan, with the whole Budget cap as its one pool. The
// Phases run in order and spend from it together.
// -----
export const freshMeter = (budgetUsd: number): Meter => ({
  budgetUsd,
  spentUsd: 0,
  reservedUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

// -----
// What the pool still holds: the cap a run of the agent gets as its own
// `--max-budget-usd`. Never negative, because calls in flight when the
// cap was reached can take the spend a little past it.
// -----
export const remainingUsd = (meter: Meter): number => Math.max(0, meter.budgetUsd - meter.spentUsd);
