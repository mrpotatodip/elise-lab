import type { SubscriptionSourceValue, SubscriptionStatusValue } from "@repo/contracts/elise";

// -----
// What a billing call needs to know about the Account: its name, an
// admin's email for Stripe, and its Subscription row, if any.
// -----
export type BillingContext = {
  accountName: string;
  adminEmail: string | null;
  subscription: {
    source: SubscriptionSourceValue;
    status: SubscriptionStatusValue;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    planId: string;
  } | null;
};

export type PlanByKey = { id: string; key: string; label: string; priceId: string | null; enabled: boolean; maxMembers: number };
