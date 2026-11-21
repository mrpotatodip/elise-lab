import { describe, expect, it } from "vitest";
import { CREDIT_ENTRY_LABEL, PLAN_STATUS_VIEW, creditAmountLabel, planKeyLabel, planPeriodSentence, planSeatsLabel, planSourceLabel } from "#/modules/plan/utils/plan-format";

describe("planSeatsLabel", () => {
  it.each([
    ["no waiting invites", { members: 3, pendingInvites: 0 }, "3 of 5 people"],
    ["one waiting invite", { members: 3, pendingInvites: 1 }, "4 of 5 people, including 1 waiting invite"],
    ["two waiting invites", { members: 2, pendingInvites: 2 }, "4 of 5 people, including 2 waiting invites"],
  ])("counts %s as the invite limit does", (_name, seats, expected) => {
    expect(planSeatsLabel(seats, 5)).toBe(expected);
  });
});

describe("PLAN_STATUS_VIEW", () => {
  it.each([
    ["active", null],
    ["past_due", "Payment failed. Scans keep running for 7 days after the first failure, then pause."],
    ["unpaid", "Scans are paused until the plan is active again."],
    ["canceled", "Scans are paused until the plan is active again."],
    ["incomplete", "The plan is not active yet."],
  ] as const)("says what %s means for scans", (status, note) => {
    expect(PLAN_STATUS_VIEW[status].note).toBe(note);
  });
});

describe("planPeriodSentence", () => {
  it.each([
    ["an active plan", "active", false, "2026-12-21T00:00:00Z", ". Renews Dec 21, 2026"],
    ["a plan set to cancel", "active", true, "2026-12-21T00:00:00Z", ". Ends on Dec 21, 2026"],
    ["a canceled plan", "canceled", false, "2026-12-21T00:00:00Z", ""],
    ["no period end", "active", false, null, ""],
  ] as const)("reads %s", (_name, status, cancelAtPeriodEnd, currentPeriodEnd, expected) => {
    expect(planPeriodSentence({ status, cancelAtPeriodEnd, currentPeriodEnd })).toBe(expected);
  });
});

describe("creditAmountLabel", () => {
  it.each([
    [20, "+$20.00"],
    [-0.3, "-$0.30"],
    [0, "$0.00"],
  ])("writes %s as %s", (amount, expected) => {
    expect(creditAmountLabel(amount)).toBe(expected);
  });
});

describe("plan words", () => {
  it("names who bills the plan and whose key a scan uses", () => {
    expect([planSourceLabel("grant"), planSourceLabel("stripe"), planKeyLabel("account"), planKeyLabel("platform")]).toEqual([
      "Granted by Elise, no invoice",
      "Card, through Stripe",
      "Your own Claude, through a Runner",
      "Our key, paid with credit",
    ]);
  });

  it("labels a hold as a running scan, so a person never reads scan_hold", () => {
    expect(CREDIT_ENTRY_LABEL.scan_hold).toBe("Held for a running scan");
  });
});
