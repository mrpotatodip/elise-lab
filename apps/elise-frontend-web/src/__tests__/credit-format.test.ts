import { describe, expect, it } from "vitest";
import { creditProfileHold, creditScansLabel } from "#/modules/credit/utils/credit-format";

describe("creditProfileHold", () => {
  const quick = { profile: "quick" as const, capUsd: 6, holdUsd: 9 };
  const standard = { profile: "standard" as const, capUsd: 12, holdUsd: 18 };
  const deepOnOwnKey = { profile: "deep" as const, capUsd: 18, holdUsd: null };
  const credit = { profiles: [quick, standard, deepOnOwnKey] };

  it("reads the hold the engine gave for the profile", () => {
    expect(creditProfileHold(credit, "standard")).toBe(18);
  });

  it.each<[string, Parameters<typeof creditProfileHold>[0], "quick" | "standard" | "deep"]>([
    ["an Account on its own key (hold null)", credit, "deep"],
    ["an engine that sends no profiles", {}, "standard"],
    ["no credit loaded yet", undefined, "standard"],
    ["a profile the engine did not list", { profiles: [quick] }, "deep"],
  ])("is null for %s", (_name, balance, profile) => {
    expect(creditProfileHold(balance, profile)).toBeNull();
  });
});

describe("creditScansLabel", () => {
  it.each([
    [12, null, "12"],
    [0, null, "0"],
    [12, 300, "12 of 300"],
    [300, 300, "300 of 300"],
  ])("shows %s scans against an allowance of %s as %s", (scans, allowance, expected) => {
    expect(creditScansLabel(scans, allowance)).toBe(expected);
  });
});
