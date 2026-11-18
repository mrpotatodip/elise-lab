import { describe, expect, it } from "vitest";
import { runnerAddedBy } from "#/modules/runner/utils";
import type { Runner } from "#/modules/runner/schemas";

const runner = (createdByName?: string | null): Runner => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Box",
  state: "connected",
  createdAt: "2026-11-18T09:00:00.000Z",
  expiresAt: null,
  pairedAt: null,
  lastSeenAt: null,
  createdByName,
});

describe("who added a Runner", () => {
  it.each([
    { name: "Ada Rossi", expected: "Added by Ada Rossi." },
    { name: null, expected: null },
    { name: undefined, expected: null },
  ])("reads $expected for $name", ({ name, expected }) => {
    expect(runnerAddedBy(runner(name))).toBe(expected);
  });
});
