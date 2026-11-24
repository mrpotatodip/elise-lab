import { RUNNER_SPEND_LIMIT_MAX_USD } from "@repo/contracts/elise";

const SPEND_LIMIT_MIN_USD = 1;
const DOLLAR_AMOUNT = /^\d+(\.\d{1,2})?$/;

export function scanSpendLimitOf(text: string | null) {
  if (text === null) return { usd: undefined, problem: null };
  const trimmed = text.trim();
  if (trimmed === "") return { usd: undefined, problem: "Enter a dollar amount" };
  if (/^-\d/.test(trimmed)) return { usd: undefined, problem: `The limit must be at least $${SPEND_LIMIT_MIN_USD}` };
  if (!DOLLAR_AMOUNT.test(trimmed)) return { usd: undefined, problem: "Enter a dollar amount, like 12 or 12.50" };
  const usd = Number(trimmed);
  if (usd < SPEND_LIMIT_MIN_USD)
    return { usd: undefined, problem: `The limit must be at least $${SPEND_LIMIT_MIN_USD}` };
  if (usd > RUNNER_SPEND_LIMIT_MAX_USD)
    return { usd: undefined, problem: `The most one Scan may spend is $${RUNNER_SPEND_LIMIT_MAX_USD}` };
  return { usd, problem: null };
}

export function scanSpendLimitShown(storedUsd: number, profileCapUsd: number | undefined) {
  if (storedUsd !== RUNNER_SPEND_LIMIT_MAX_USD) return true;
  return profileCapUsd === RUNNER_SPEND_LIMIT_MAX_USD;
}

export function scanSpendLimitTextAfterProfileChange(text: string | null, previousCapUsd: number | undefined) {
  if (text === null || previousCapUsd === undefined) return text;
  return scanSpendLimitOf(text).usd === previousCapUsd ? null : text;
}
