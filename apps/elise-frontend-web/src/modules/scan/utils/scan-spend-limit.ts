import { RUNNER_SPEND_LIMIT_MAX_USD } from "@repo/contracts/elise";

const SPEND_LIMIT_MIN_USD = 1;

export function scanSpendLimitOf(text: string | null) {
  if (text === null) return { usd: undefined, problem: null };
  const usd = text.trim() === "" ? Number.NaN : Number(text);
  if (Number.isNaN(usd)) return { usd: undefined, problem: "Enter a dollar amount" };
  if (usd < SPEND_LIMIT_MIN_USD)
    return { usd: undefined, problem: `The limit must be at least $${SPEND_LIMIT_MIN_USD}` };
  if (usd > RUNNER_SPEND_LIMIT_MAX_USD)
    return { usd: undefined, problem: `The most one Scan may spend is $${RUNNER_SPEND_LIMIT_MAX_USD}` };
  return { usd, problem: null };
}
