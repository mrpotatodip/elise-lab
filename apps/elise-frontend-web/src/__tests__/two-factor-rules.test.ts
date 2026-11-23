import { describe, expect, it } from "vitest";
import { canTurnOff, codeInput, screenAfterSignIn, secondStepFailure, spacedKey } from "#/modules/auth/utils";

describe("which screen follows a sign-in response", () => {
  it.each([
    { outcome: "challenge", setupRequired: false, screen: "second-step" },
    { outcome: "challenge", setupRequired: true, screen: "second-step" },
    { outcome: "unverified", setupRequired: false, screen: "unverified" },
    { outcome: "session", setupRequired: true, screen: "setup" },
    { outcome: "session", setupRequired: false, screen: "app" },
  ] as const)("$outcome with setupRequired $setupRequired opens $screen", ({ outcome, setupRequired, screen }) => {
    expect(screenAfterSignIn(outcome, setupRequired)).toBe(screen);
  });
});

describe("what the second step does with a failed answer", () => {
  it.each([
    { status: 401, code: "INVALID_CODE", failure: "wrong" },
    { status: 401, code: undefined, failure: "wrong" },
    { status: 429, code: "ACCOUNT_TEMPORARILY_LOCKED", failure: "locked" },
    { status: 429, code: undefined, failure: "locked" },
    { status: 401, code: "INVALID_TWO_FACTOR_COOKIE", failure: "expired" },
    { status: 500, code: undefined, failure: "other" },
  ])("status $status code $code is $failure", ({ status, code, failure }) => {
    expect(secondStepFailure(status, code)).toBe(failure);
  });
});

describe("which endpoint a typed code goes to", () => {
  it.each([
    { typed: "123456", expected: { kind: "totp", code: "123456" } },
    { typed: " 123 456 ", expected: { kind: "totp", code: "123456" } },
    { typed: "abcde-12345", expected: { kind: "backup", code: "abcde-12345" } },
    { typed: " abcde-12345 ", expected: { kind: "backup", code: "abcde-12345" } },
    { typed: "12345", expected: { kind: "backup", code: "12345" } },
  ])("$typed", ({ typed, expected }) => {
    expect(codeInput(typed)).toEqual(expected);
  });
});

describe("the typed key", () => {
  it.each([
    { key: "ABCDEFGHIJ", spaced: "ABCD EFGH IJ" },
    { key: "", spaced: "" },
  ])("groups $key in fours", ({ key, spaced }) => {
    expect(spacedKey(key)).toBe(spaced);
  });
});

describe("who may turn Two-factor off", () => {
  it.each([
    { role: "tenant_admin", allowed: false },
    { role: "workspace_admin", allowed: false },
    { role: "member", allowed: true },
  ])("$role: $allowed", ({ role, allowed }) => {
    expect(canTurnOff(role)).toBe(allowed);
  });
});
