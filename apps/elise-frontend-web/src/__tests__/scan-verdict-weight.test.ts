import { describe, expect, it } from "vitest";
import { VerdictSchema } from "#/modules/scan/schemas";
import { verdictScansToRun } from "#/modules/scan/utils/scan-format";

const verdictWith = (scans: { required: number; counted: number }) => ({
  verdict: "cannot_tell",
  commit: "a".repeat(40),
  reasons: [{ code: "too_few_scans", message: "Scans of this commit weigh 0.5 of 1" }],
  scans: { ...scans, ids: ["s1"] },
  limits: { critical: 0, high: 0, medium: 3 },
  counts: { critical: 0, high: 0, medium: 0, low: 0, informational: 0, needsValidation: 0 },
  open: [],
  accepted: [],
  dismissed: [],
});

describe("VerdictSchema scan weight", () => {
  it.each([
    { required: 1, counted: 0.5 },
    { required: 1, counted: 1.5 },
    { required: 1, counted: 0 },
  ])("reads $counted of $required as a number", (scans) => {
    expect(VerdictSchema.safeParse(verdictWith(scans)).success).toBe(true);
  });

  it("still rejects a negative weight", () => {
    expect(VerdictSchema.safeParse(verdictWith({ required: 1, counted: -0.5 })).success).toBe(false);
  });
});

describe("verdictScansToRun", () => {
  it.each([
    { missing: 0.5, runs: 1 },
    { missing: 1, runs: 1 },
  ])("asks for $runs scan when $missing of weight is missing", ({ missing, runs }) => {
    expect(verdictScansToRun(missing)).toBe(runs);
  });
});
