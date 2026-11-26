import { describe, expect, it } from "vitest";
import type { Meter } from "#/modules/scan-sandbox/types";
import { parseAgentPhases, phaseSpends } from "#/modules/scan-sandbox/utils";

const meter = (spentUsd: number, inputTokens: number): Meter => ({
  budgetUsd: 20,
  spentUsd,
  inputTokens,
  outputTokens: inputTokens * 2,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

describe("phaseSpends", () => {
  it("gives each Phase the meter's reading at its end minus its start, and the Phases add up to the meter", () => {
    const current = meter(9, 90);
    const spends = phaseSpends(
      [
        { phase: "recon", meter: meter(0, 0) },
        { phase: "hunt", meter: meter(1.5, 10) },
        { phase: "check", meter: meter(5.5, 50) },
      ],
      current,
    );

    expect(spends.map((spend) => [spend.phase, spend.costUsd, spend.inputTokens])).toEqual([
      ["recon", 1.5, 10],
      ["hunt", 4, 40],
      ["check", 3.5, 40],
    ]);
    expect(spends.reduce((sum, spend) => sum + spend.costUsd, 0)).toBeCloseTo(current.spentUsd);
  });

  it("keeps a Scan that stopped after one Phase to that Phase", () => {
    expect(phaseSpends([{ phase: "recon", meter: meter(0, 0) }], meter(2, 5)).map((spend) => spend.phase)).toEqual([
      "recon",
    ]);
  });
});

const run = (cost: number) =>
  JSON.stringify({
    type: "result",
    total_cost_usd: cost,
    num_turns: 2,
    duration_ms: 1000,
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  });
const noise = JSON.stringify({ type: "assistant", message: "x" });

describe("parseAgentPhases", () => {
  it("reads the Runner's runs as the Phases in order, before the line that sums them", () => {
    const log = [noise, run(1), noise, run(2), run(3)].join("\n");

    expect(parseAgentPhases(log)?.map((phase) => [phase.phase, phase.costUsd])).toEqual([
      ["recon", 1],
      ["hunt", 2],
    ]);
  });

  it("adds a repair run to the last Phase", () => {
    const log = [run(1), run(1), run(1), run(1), run(0.5), run(4.5)].join("\n");

    expect(parseAgentPhases(log)?.at(-1)).toMatchObject({ phase: "report", costUsd: 1.5 });
  });

  it.each([
    ["a log with one result and no sum line", run(3)],
    ["a log whose runs do not add up to its sum", [run(1), run(2), run(9)].join("\n")],
    ["no log lines", ""],
  ])("gives no split for %s", (_name, log) => {
    expect(parseAgentPhases(log)).toBeNull();
  });
});
