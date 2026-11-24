import type { CreditEntry, PlanDetails, PlanOffer } from "@repo/contracts/elise";
import { usageUsd } from "#/modules/usage";

type StatusView = { label: string; variant: "success" | "warning" | "destructive" | "neutral"; note: string | null };

// -----
// How a subscription's status reads. An active plan says nothing
// more; any other status says what it means for scans, in a
// sentence, and no date the engine does not report.
// -----
export const PLAN_STATUS_VIEW = {
  active: { label: "Active", variant: "success", note: null },
  past_due: {
    label: "Payment failed",
    variant: "warning",
    note: "Payment failed. Scans keep running for 7 days after the first failure, then pause.",
  },
  unpaid: { label: "Unpaid", variant: "destructive", note: "Scans are paused until the plan is active again." },
  canceled: { label: "Canceled", variant: "destructive", note: "Scans are paused until the plan is active again." },
  incomplete: { label: "Not active yet", variant: "neutral", note: "The plan is not active yet." },
} as const satisfies Record<NonNullable<PlanDetails["status"]>, StatusView>;

export const planSourceLabel = (source: NonNullable<PlanDetails["source"]>) =>
  source === "grant" ? "Granted by Elise, no invoice" : "Card, through Stripe";

const PORTAL_STATUSES: ReadonlyArray<PlanDetails["status"]> = ["active", "past_due", "unpaid"];

export const planBillingAction = (data: Pick<PlanDetails, "source" | "status">): "subscribe" | "manage" =>
  data.source === "stripe" && PORTAL_STATUSES.includes(data.status) ? "manage" : "subscribe";

export const planSwitchOffers = (
  data: Pick<PlanDetails, "plan" | "source" | "status">,
  offers: ReadonlyArray<PlanOffer>,
) =>
  data.source === "stripe" && data.status === "active" && data.plan !== null
    ? offers.filter((offer) => offer.key !== data.plan?.key)
    : [];

export type PlanInterval = NonNullable<PlanDetails["interval"]>;

export type PlanPriceView = { amount: string; unit: PlanInterval; perMonth: string | null };

export const planPriceView = (
  offer: Pick<PlanOffer, "monthlyPriceUsd" | "yearlyPriceUsd">,
  interval: PlanInterval,
): PlanPriceView | null => {
  if (interval === "month") return { amount: usageUsd(offer.monthlyPriceUsd), unit: "month", perMonth: null };
  if (offer.yearlyPriceUsd === null || offer.yearlyPriceUsd === undefined) return null;
  return {
    amount: usageUsd(offer.yearlyPriceUsd),
    unit: "year",
    perMonth: `${usageUsd(offer.yearlyPriceUsd / 12)} per month`,
  };
};

export const planYearlyOffered = (offers: ReadonlyArray<Pick<PlanOffer, "yearlyPriceUsd">>) =>
  offers.some((offer) => offer.yearlyPriceUsd !== null && offer.yearlyPriceUsd !== undefined);

export const planYearlyLocked = (data: Pick<PlanDetails, "source" | "status" | "interval">) =>
  data.source === "stripe" && data.interval === "year" && (data.status === "active" || data.status === "past_due");

export const planShownInterval = (
  data: Pick<PlanDetails, "source" | "status" | "interval">,
  chosen: PlanInterval,
): PlanInterval => (planYearlyLocked(data) ? "year" : chosen);

export type PlanCardView = {
  offer: PlanOffer;
  current: boolean;
  action: "switch" | "switchInterval" | "subscribe" | "none";
  blocked: string | null;
};

export const planCardViews = (
  data: Pick<PlanDetails, "plan" | "source" | "status" | "seats" | "interval">,
  offers: ReadonlyArray<PlanOffer>,
  chosen: PlanInterval = "month",
): PlanCardView[] => {
  const { members, pendingInvites } = data.seats;
  const shown = planShownInterval(data, chosen);
  const subInterval = data.interval ?? "month";
  const active = data.source === "stripe" && data.status === "active" && data.plan !== null;
  const people = members + pendingInvites;
  const held = data.status === null || data.status === "active" || data.status === "past_due";
  const counts = `${members} ${members === 1 ? "person" : "people"}${pendingInvites > 0 ? ` and ${pendingInvites} pending invite${pendingInvites === 1 ? "" : "s"}` : ""}`;
  const switchKeys = new Set(planSwitchOffers(data, offers).map((offer) => offer.key));
  const subscribes = planBillingAction(data) === "subscribe";

  return offers.map((offer) => {
    const priced = planPriceView(offer, shown) !== null;
    const action = ((): PlanCardView["action"] => {
      if (active && offer.key === data.plan?.key)
        return subInterval === "month" && chosen === "year" && priced ? "switchInterval" : "none";
      if (switchKeys.has(offer.key)) return priced && shown === subInterval ? "switch" : "none";
      return subscribes && priced ? "subscribe" : "none";
    })();
    const over = people - offer.maxMembers;
    const blocked =
      (action === "switch" || action === "subscribe") && over > 0
        ? `Your account has ${counts}. ${offer.label} holds ${offer.maxMembers}. Remove ${over} to ${action === "switch" ? "switch" : "subscribe"}.`
        : action === "none" && switchKeys.has(offer.key) && priced && shown !== subInterval
          ? "Switch to yearly first, then change plan."
          : null;
    return { offer, current: held && data.plan?.key === offer.key, action, blocked };
  });
};

export type PlanSwitchTarget = { planKey: string; interval?: PlanInterval };

export const planSwitchPending = (target: PlanSwitchTarget | null, data: Pick<PlanDetails, "plan" | "interval">) =>
  target !== null &&
  (data.plan?.key !== target.planKey ||
    (target.interval !== undefined && (data.interval ?? "month") !== target.interval));

export const planConfirmingPayment = (
  checkout: "success" | "cancelled" | undefined,
  data: Pick<PlanDetails, "source" | "status">,
) => checkout === "success" && !(data.source === "stripe" && data.status === "active");

export const planKeyLabel = (keySource: NonNullable<PlanDetails["plan"]>["keySource"]) =>
  keySource === "account" ? "Your own Claude, through a Runner" : "Our key, paid with credit";

// -----
// The same count the invite limit uses: people in the account plus
// invites still waiting, against what the plan holds.
// -----
export const planSeatsLabel = (seats: PlanDetails["seats"], maxMembers: number) => {
  const used = `${seats.members + seats.pendingInvites} of ${maxMembers} people`;
  if (seats.pendingInvites === 0) return used;
  return `${used}, including ${seats.pendingInvites} waiting invite${seats.pendingInvites === 1 ? "" : "s"}`;
};

const RENEWS = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const planDateLabel = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : RENEWS.format(date);
};

export const planPeriodSentence = (data: Pick<PlanDetails, "status" | "cancelAtPeriodEnd" | "currentPeriodEnd">) => {
  if (data.currentPeriodEnd === null || data.status === "canceled") return "";
  const date = planDateLabel(data.currentPeriodEnd);
  return data.cancelAtPeriodEnd === true ? `. Ends on ${date}` : `. Renews ${date}`;
};

export const planBilledYearlySentence = (data: Pick<PlanDetails, "cancelAtPeriodEnd" | "currentPeriodEnd">) => {
  if (data.currentPeriodEnd === null) return "Billed yearly.";
  const date = planDateLabel(data.currentPeriodEnd);
  return data.cancelAtPeriodEnd === true ? `Billed yearly, ends on ${date}.` : `Billed yearly, renews on ${date}.`;
};

export const CREDIT_ENTRY_LABEL = {
  grant: "Monthly credit",
  topup: "Top-up",
  scan_hold: "Held for a running scan",
  scan_settle: "Scan",
  expiry: "Expired",
  adjustment: "Adjustment",
} as const satisfies Record<CreditEntry["kind"], string>;

// -----
// Credit added reads with a plus, credit taken with a minus.
// -----
export const creditAmountLabel = (amountUsd: number) =>
  amountUsd > 0 ? `+${usageUsd(amountUsd)}` : usageUsd(amountUsd);
