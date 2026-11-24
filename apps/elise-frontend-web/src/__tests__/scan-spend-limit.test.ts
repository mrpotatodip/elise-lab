import { describe, expect, it } from "vitest";
import { RUNNER_SPEND_LIMIT_MAX_USD } from "@repo/contracts/elise";
import { scanSpendLimitOf } from "#/modules/scan/utils/scan-spend-limit";
import { scanCreateBodyOf } from "#/modules/scan/utils/scan-create-body";

describe("scanSpendLimitOf", () => {
  it("sends no limit while the field follows the profile, so the engine uses the profile's cap", () => {
    expect(scanSpendLimitOf(null)).toEqual({ usd: undefined, problem: null });
  });

  it.each([
    ["1", 1],
    ["30", 30],
    [" 12.5 ", 12.5],
    [String(RUNNER_SPEND_LIMIT_MAX_USD), RUNNER_SPEND_LIMIT_MAX_USD],
  ])("takes %j as $%s", (text, usd) => {
    expect(scanSpendLimitOf(text)).toEqual({ usd, problem: null });
  });

  it.each([
    ["", "Enter a dollar amount"],
    ["abc", "Enter a dollar amount"],
    ["0.5", "The limit must be at least $1"],
    ["-3", "The limit must be at least $1"],
    [String(RUNNER_SPEND_LIMIT_MAX_USD + 1), `The most one Scan may spend is $${RUNNER_SPEND_LIMIT_MAX_USD}`],
  ])("refuses %j with a message", (text, problem) => {
    expect(scanSpendLimitOf(text)).toEqual({ usd: undefined, problem });
  });
});

describe("scanCreateBodyOf with a limit", () => {
  it("names the limit max_budget_usd, like the engine", () => {
    const body = scanCreateBodyOf({
      repo: "https://github.com/acme/app",
      model: "claude-sonnet-5-5",
      effort: "high",
      profile: "standard",
      maxBudgetUsd: 40,
    });

    expect(body).toMatchObject({ max_budget_usd: 40 });
    expect(body).not.toHaveProperty("maxBudgetUsd");
  });
});
