import { describe, expect, it } from "vitest";
import {
  CREDIT_ENTRY_LABEL,
  PLAN_STATUS_VIEW,
  creditAmountLabel,
  planBilledYearlySentence,
  planKeyLabel,
  planPeriodSentence,
  planCardViews,
  planPriceView,
  planSeatsLabel,
  planSourceLabel,
  planSwitchOffers,
  planSwitchPending,
} from "#/modules/plan/utils/plan-format";

const onPlan = (key: string) => ({
  key,
  label: key,
  monthlyPriceUsd: 0,
  includedCreditUsd: 0,
  carryCapUsd: null,
  keySource: "account" as const,
  scanAllowance: null,
  maxMembers: 5,
});

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
    [
      "no plan, 1 person: both subscribe",
      { ...none, seats: seats(1, 0) },
      [
        ["subscribe", null, false],
        ["subscribe", null, false],
      ],
    ],
    [
      "no plan, 3 people: Starter is blocked",
      { ...none, seats: seats(3, 0) },
      [
        ["subscribe", "Your account has 3 people. Starter holds 2. Remove 1 to subscribe.", false],
        ["subscribe", null, false],
      ],
    ],
    [
      "Runner, active, 2 people: can switch to Starter",
      { plan: onPlan("runner"), source: "stripe", status: "active", seats: seats(1, 1) },
      [
        ["switch", null, false],
        ["none", null, true],
      ],
    ],
    [
      "Runner, active, 3 people and 1 invite: Starter switch blocked",
      { plan: onPlan("runner"), source: "stripe", status: "active", seats: seats(3, 1) },
      [
        ["switch", "Your account has 3 people and 1 pending invite. Starter holds 2. Remove 2 to switch.", false],
        ["none", null, true],
      ],
    ],
    [
      "Runner, active, 2 people and 2 invites: invites are plural",
      { plan: onPlan("runner"), source: "stripe", status: "active", seats: seats(2, 2) },
      [
        ["switch", "Your account has 2 people and 2 pending invites. Starter holds 2. Remove 2 to switch.", false],
        ["none", null, true],
      ],
    ],
    [
      "Starter, active: can switch to Runner",
      { plan: onPlan("starter"), source: "stripe", status: "active", seats: seats(2, 0) },
      [
        ["none", null, true],
        ["switch", null, false],
      ],
    ],
    [
      "past due: no card has an action, the plan stays current",
      { plan: onPlan("runner"), source: "stripe", status: "past_due", seats: seats(1, 0) },
      [
        ["none", null, false],
        ["none", null, true],
      ],
    ],
    [
      "canceled: subscribe again, no plan is current",
      { plan: onPlan("runner"), source: "stripe", status: "canceled", seats: seats(1, 0) },
      [
        ["subscribe", null, false],
        ["subscribe", null, false],
      ],
    ],
  ] as const)("%s", (_name, data, expected) => {
    expect(planCardViews(data, offers).map((view) => [view.action, view.blocked, view.current])).toEqual(expected);
  });
});

describe("planPriceView", () => {
  const starter = { monthlyPriceUsd: 15, yearlyPriceUsd: 150 };

  it.each([
    ["monthly", starter, "month", { amount: "$15.00", unit: "month", perMonth: null }],
    [
      "yearly, with the per-month figure",
      starter,
      "year",
      { amount: "$150.00", unit: "year", perMonth: "$12.50 per month" },
    ],
    ["yearly, a plan with no yearly price", { monthlyPriceUsd: 15, yearlyPriceUsd: null }, "year", null],
    ["yearly, an engine that sends no yearly price", { monthlyPriceUsd: 15 }, "year", null],
  ] as const)("reads %s", (_name, offer, interval, expected) => {
    expect(planPriceView(offer, interval)).toEqual(expected);
  });
});

const actions = (
  data: Parameters<typeof planCardViews>[0],
  interval: "month" | "year",
  list: Parameters<typeof planCardViews>[1],
) => planCardViews(data, list, interval).map((view) => view.action);

describe("yearly billing in planCardViews", () => {
  const offers = [
    { key: "starter", label: "Starter", monthlyPriceUsd: 15, yearlyPriceUsd: 150, includedCreditUsd: 0, maxMembers: 2 },
    { key: "runner", label: "Runner", monthlyPriceUsd: 35, yearlyPriceUsd: null, includedCreditUsd: 0, maxMembers: 5 },
  ];
  const sub = (key: string, interval: "month" | "year") => ({
    plan: onPlan(key),
    source: "stripe" as const,
    status: "active" as const,
    interval,
    seats: seats(1, 0),
  });

  it.each([
    [
      "a new subscriber on the yearly toggle subscribes only where a yearly price exists",
      { plan: null, source: null, status: null, seats: seats(1, 0) },
      "year",
      ["subscribe", "none"],
    ],
    [
      "a monthly Subscription viewed yearly can switch its own plan to yearly, and no other",
      sub("starter", "month"),
      "year",
      ["switchInterval", "none"],
    ],
    [
      "a monthly Subscription viewed monthly keeps the plan switch",
      sub("starter", "month"),
      "month",
      ["none", "switch"],
    ],
    [
      "a yearly Subscription never offers monthly, whatever the toggle says",
      sub("starter", "year"),
      "month",
      ["none", "none"],
    ],
  ] as const)("%s", (_name, data, interval, expected) => {
    expect(actions(data, interval, offers)).toEqual(expected);
  });

  it("a yearly Subscription can switch to a plan that has a yearly price", () => {
    const both = offers.map((offer) => ({ ...offer, yearlyPriceUsd: offer.monthlyPriceUsd * 10 }));
    expect(actions(sub("starter", "year"), "year", both)).toEqual(["none", "switch"]);
  });
});

describe("planSwitchPending", () => {
  it.each([
    [
      "a plan change waits until the plan is the new one",
      { planKey: "starter" },
      { plan: onPlan("runner"), interval: "month" as const },
      true,
    ],
    [
      "a plan change is done once the plan matches",
      { planKey: "starter" },
      { plan: onPlan("starter"), interval: "month" as const },
      false,
    ],
    [
      "a switch to yearly waits while the Subscription is monthly",
      { planKey: "starter", interval: "year" as const },
      { plan: onPlan("starter"), interval: "month" as const },
      true,
    ],
    [
      "a switch to yearly is done once the Subscription is yearly",
      { planKey: "starter", interval: "year" as const },
      { plan: onPlan("starter"), interval: "year" as const },
      false,
    ],
    [
      "nothing is pending when no switch was made",
      null,
      { plan: onPlan("starter"), interval: "month" as const },
      false,
    ],
  ])("%s", (_name, target, data, expected) => {
    expect(planSwitchPending(target, data)).toBe(expected);
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

describe("planBilledYearlySentence", () => {
  it.each([
    ["renewing", false, "2027-11-22T00:00:00Z", "Billed yearly, renews on Nov 22, 2027."],
    ["set to cancel", true, "2027-11-22T00:00:00Z", "Billed yearly, ends on Nov 22, 2027."],
    ["with no period end", false, null, "Billed yearly."],
  ] as const)("reads %s", (_name, cancelAtPeriodEnd, currentPeriodEnd, expected) => {
    expect(planBilledYearlySentence({ cancelAtPeriodEnd, currentPeriodEnd })).toBe(expected);
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
    expect([
      planSourceLabel("grant"),
      planSourceLabel("stripe"),
      planKeyLabel("account"),
      planKeyLabel("platform"),
    ]).toEqual([
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
