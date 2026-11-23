import { SCAN_SANDBOX_DEFAULT_PRICE, SCAN_SANDBOX_METER_EPSILON, SCAN_SANDBOX_MODEL_PRICES } from "#/modules/scan-sandbox/constants";
import type { Meter, MeteredTokens } from "#/modules/scan-sandbox/types";

// -----
// The sum of the numbers that are there, or null when none is: a run
// that reported no turns has no turns, not zero.
// -----
export const sumOrNull = (values: (number | null)[]): number | null =>
  values.some((value) => value !== null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;

const NO_TOKENS: MeteredTokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

const priceOf = (model: string) => new Map(Object.entries(SCAN_SANDBOX_MODEL_PRICES)).get(model) ?? SCAN_SANDBOX_DEFAULT_PRICE;

export const priceUsage = (model: string, tokens: MeteredTokens): number => {
  const price = priceOf(model);
  return (
    (tokens.inputTokens * price.input +
      tokens.outputTokens * price.output +
      tokens.cacheReadTokens * price.cacheRead +
      tokens.cacheWriteTokens * price.cacheWrite) /
    1_000_000
  );
};

// -----
// The meter of a Scan, with the whole Budget cap as its one pool. The
// Phases run in order and spend from it together.
// -----
export const freshMeter = (budgetUsd: number): Meter => ({ budgetUsd, spentUsd: 0, reservedUsd: 0, ...NO_TOKENS });

// -----
// What the pool still holds: the cap a run of the agent gets as its own
// `--max-budget-usd`. Never negative, because calls in flight when the
// cap was reached can take the spend a little past it.
// -----
export const remainingUsd = (meter: Meter): number => Math.max(0, meter.budgetUsd - meter.spentUsd);

export const reserveUsd = (model: string, maxTokens: number): number => priceUsage(model, { ...NO_TOKENS, outputTokens: maxTokens });

export const withReserve = (meter: Meter, usd: number): Meter | null => {
  const reservedUsd = meter.reservedUsd ?? 0;
  if (meter.spentUsd + reservedUsd + usd > meter.budgetUsd + SCAN_SANDBOX_METER_EPSILON) return null;
  return { ...meter, reservedUsd: reservedUsd + usd };
};

export const withoutReserve = (meter: Meter, usd: number): Meter => ({ ...meter, reservedUsd: Math.max(0, (meter.reservedUsd ?? 0) - usd) });

export const withSpend = (meter: Meter, model: string, tokens: MeteredTokens): Meter => ({
  ...meter,
  inputTokens: meter.inputTokens + tokens.inputTokens,
  outputTokens: meter.outputTokens + tokens.outputTokens,
  cacheReadTokens: meter.cacheReadTokens + tokens.cacheReadTokens,
  cacheWriteTokens: meter.cacheWriteTokens + tokens.cacheWriteTokens,
  spentUsd: meter.spentUsd + priceUsage(model, tokens),
});
