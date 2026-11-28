import { describe, expect, it } from "vitest";
import type { MeAccount } from "@repo/contracts/elise";
import { safeRedirectPath } from "#/modules/auth/utils";
import { denyAccountId, deviceAccounts, ipDiffers, preselectedAccountId } from "#/modules/device/utils";

const account = (id: string, name: string, powers: string[] | undefined): MeAccount => ({
  id,
  name,
  slug: name,
  role: "member",
  roleLabel: "Member",
  powers,
});

const ADMIN = account("11111111-1111-4111-8111-111111111111", "Acme", [
  "company:runners:create",
  "company:team:members:read",
]);
const MEMBER = account("22222222-2222-4222-8222-222222222222", "Beta", ["company:dashboard:read"]);
const LISTED_A = { id: "a", name: "A", runScans: true, maxCli: "start" } as const;
const LISTED_B = { id: "b", name: "B", runScans: true, maxCli: "start" } as const;
const OLD_ENGINE = account("33333333-3333-4333-8333-333333333333", "Gamma", undefined);

describe("which Accounts the device page lists", () => {
  it("lists the Accounts where the Role holds a Runner or CLI Power", () => {
    expect(deviceAccounts([ADMIN, MEMBER, OLD_ENGINE]).map(({ id }) => id)).toEqual([ADMIN.id, MEMBER.id]);
  });

  it("lists nothing when no Account carries a Power", () => {
    expect(deviceAccounts([OLD_ENGINE])).toEqual([]);
  });

  it.each([
    { listed: [LISTED_A], expected: "a" },
    { listed: [], expected: "" },
    {
      listed: [LISTED_A, LISTED_B],
      expected: "",
    },
  ])("preselects $expected out of $listed.length listed", ({ listed, expected }) => {
    expect(preselectedAccountId(listed)).toBe(expected);
  });
});

describe("which Account a denial is written in", () => {
  const listed = [LISTED_A, LISTED_B];

  it.each([
    { listed, picked: "b", expected: "b" },
    { listed, picked: "", expected: "a" },
    { listed, picked: "zzz", expected: "a" },
    { listed: [], picked: "b", expected: "" },
  ])("picked '$picked' of $listed.length listed gives '$expected'", ({ listed: accounts, picked, expected }) => {
    expect(denyAccountId(accounts, picked)).toBe(expected);
  });
});

describe("when the IP flag shows", () => {
  it.each([
    { requested: "203.0.113.7", yours: "198.51.100.9", flagged: true },
    { requested: "203.0.113.7", yours: "203.0.113.7", flagged: false },
    { requested: "203.0.113.7", yours: null, flagged: false },
    { requested: "203.0.113.7", yours: "", flagged: false },
  ])("requested $requested, yours $yours: flagged $flagged", ({ requested, yours, flagged }) => {
    expect(ipDiffers(requested, yours)).toBe(flagged);
  });
});

describe("where sign-in may send a person", () => {
  it.each([
    { path: "/device?code=K7QM-4TXD", ok: true },
    { path: "//evil.example", ok: false },
    { path: "/\\evil.example", ok: false },
    { path: "https://evil.example", ok: false },
    { path: "/a\nb", ok: false },
    { path: undefined, ok: false },
  ])("$path is allowed: $ok", ({ path, ok }) => {
    expect(safeRedirectPath(path) !== undefined).toBe(ok);
  });
});
