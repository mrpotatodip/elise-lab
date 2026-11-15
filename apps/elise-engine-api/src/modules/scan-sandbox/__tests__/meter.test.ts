import { describe, expect, it } from "vitest";
import { freshMeter, remainingUsd, sumOrNull, withReserve } from "#/modules/scan-sandbox/utils";

const CAP = 2;

describe("the one pool of a Scan's Budget cap", () => {
  it("is the whole cap before anything is spent", () => {
    expect(remainingUsd(freshMeter(CAP))).toBe(CAP);
  });

  it("is what the Scan has not spent yet, whichever Phase spent it", () => {
    expect(remainingUsd({ ...freshMeter(CAP), spentUsd: 0.5 })).toBeCloseTo(1.5);
  });

  it("is zero, never negative, when calls in flight took the Scan past the cap", () => {
    expect(remainingUsd({ ...freshMeter(CAP), spentUsd: 2.01 })).toBe(0);
  });

  it("refuses a model call that does not fit in what earlier Phases left, and allows one that does", () => {
    const afterTwoPhases = { ...freshMeter(CAP), spentUsd: 0.2 + 1.1 };

    expect(withReserve(afterTwoPhases, 0.7)).not.toBeNull();
    expect(withReserve(afterTwoPhases, 0.71)).toBeNull();
  });

  it("refuses every model call once the whole cap is spent", () => {
    expect(withReserve({ ...freshMeter(CAP), spentUsd: CAP }, 0.001)).toBeNull();
  });
});

describe("sumOrNull", () => {
  it.each([
    [[3, null, 4], 7],
    [[null, null], null],
    [[], null],
  ])("adds the numbers that are there in %j", (values, expected) => {
    expect(sumOrNull(values)).toBe(expected);
  });
});
