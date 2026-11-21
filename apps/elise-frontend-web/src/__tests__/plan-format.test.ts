import { describe, expect, it } from "vitest";
import { CREDIT_ENTRY_LABEL, PLAN_STATUS_VIEW, creditAmountLabel, planKeyLabel, planPeriodSentence, planCardViews, planSeatsLabel, planSourceLabel, planSwitchOffers } from "#/modules/plan/utils/plan-format";

const onPlan = (key: string) => ({ key, label: key, monthlyPriceUsd: 0, includedCreditUsd: 0, carryCapUsd: null, keySource: "account" as const, scanAllowance: null, maxMembers: 5 });

const seats = (members: number, pendingInvites: number) => ({ members, pendingInvites });

describe("planSwitchOffers", () => {
  const offers = [
    { key: "starter", label: "Starter", monthlyPriceUsd: 15, includedCreditUsd: 0, maxMembers: 2 },
    { key: "runner", label: "Runner", monthlyPriceUsd: 35, includedCreditUsd: 0, maxMembers: 5 },
  ];

  it.each([
    ["an active Stripe plan offers the other plan", "stripe", "active", "runner", ["starter"]],
    ["a Stripe plan that is past due offers none", "stripe", "past_due", "runner", []],
    ["an operator grant offers none", "grant", "active", "runner", []],
  ] as const)("%s", (_name, source, status, key, expected) => {
    expect(planSwitchOffers({ plan: onPlan(key), source, status }, offers).map((offer) => offer.key)).toEqual(expected);
  });

  it("offers no switch to an account with no plan", () => {
    expect(planSwitchOffers({ plan: null, source: null, status: null }, offers)).toEqual([]);
  });
});

describe("planCardViews", () => {
  const offers = [
    { key: "starter", label: "Starter", monthlyPriceUsd: 15, includedCreditUsd: 0, maxMembers: 2 },
    { key: "runner", label: "Runner", monthlyPriceUsd: 35, includedCreditUsd: 0, maxMembers: 5 },
  ];
  const none = { plan: null, source: null, status: null } as const;

  it.each([
    ["no plan, 1 person: both subscribe", { ...none, seats: seats(1, 0) }, [["subscribe", null], ["subscribe", null]]],
    [
      "no plan, 3 people: Starter is blocked",
      { ...none, seats: seats(3, 0) },
      [["subscribe", "Your account has 3 people and pending invites. Starter holds 2. Remove 1 to subscribe."], ["subscribe", null]],
    ],
    ["Runner, active, 2 people: can switch to Starter", { plan: onPlan("runner"), source: "stripe", status: "active", seats: seats(1, 1) }, [["switch", null], ["none", null]]],
    [
      "Runner, active, 4 people with invites: Starter switch blocked",
      { plan: onPlan("runner"), source: "stripe", status: "active", seats: seats(3, 1) },
      [["switch", "Your account has 4 people and pending invites. Starter holds 2. Remove 2 to switch."], ["none", null]],
    ],
    ["Starter, active: can switch to Runner", { plan: onPlan("starter"), source: "stripe", status: "active", seats: seats(2, 0) }, [["none", null], ["switch", null]]],
    ["past due: no card has an action", { plan: onPlan("runner"), source: "stripe", status: "past_due", seats: seats(1, 0) }, [["none", null], ["none", null]]],
  ] as const)("%s", (_name, data, expected) => {
    expect(planCardViews(data, offers).map((view) => [view.action, view.blocked])).toEqual(expected);
  });

  it("tags the current plan's card", () => {
    expect(planCardViews({ plan: onPlan("runner"), source: "stripe", status: "active", seats: seats(1, 0) }, offers).map((view) => view.current)).toEqual([false, true]);
  });
});

describe("planSeatsLabel", () => {
  it.each([
    ["no waiting invites", { members: 3, pendingInvites: 0 }, "3 of 5 people"],
    ["one waiting invite", { members: 3, pendingInvites: 1 }, "4 of 5 people, including 1 waiting invite"],
    ["two waiting invites", { members: 2, pendingInvites: 2 }, "4 of 5 people, including 2 waiting invites"],
  ])("counts %s as the invite limit does", (_name, counts, expected) => {
    expect(planSeatsLabel(counts, 5)).toBe(expected);
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
