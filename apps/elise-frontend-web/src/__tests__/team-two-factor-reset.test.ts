import { describe, expect, it } from "vitest";
import { canResetTwoFactor } from "#/modules/team/utils/two-factor-reset";

describe("canResetTwoFactor", () => {
  it.each([
    ["tenant_admin", "member", false, true],
    ["tenant_admin", "workspace_admin", false, true],
    ["tenant_admin", "tenant_admin", false, true],
    ["workspace_admin", "member", false, true],
    ["workspace_admin", "workspace_admin", false, false],
    ["workspace_admin", "tenant_admin", false, false],
    ["tenant_admin", "tenant_admin", true, false],
    ["workspace_admin", "member", true, false],
    ["member", "member", false, false],
  ])("actor %s resetting %s (self %s) is %s", (actor, target, self, expected) => {
    expect(canResetTwoFactor(actor, target, self)).toBe(expected);
  });
});
