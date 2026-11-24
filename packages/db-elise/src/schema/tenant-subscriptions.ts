import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  BILLING_INTERVAL_VALUES,
  SUBSCRIPTION_SOURCE_VALUES,
  SUBSCRIPTION_STATUS_VALUES,
  type BillingIntervalValue,
  type SubscriptionSourceValue,
  type SubscriptionStatusValue,
} from "@repo/contracts/elise";
import { platformMasterPlans } from "./platform-master-plans";
import { tenants } from "./tenant";

const inList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

// -----
// The plan an Account is on: one row per Account, and no row means
// no plan, so no new scans. A row made by Stripe follows its
// webhooks. A row with source "grant" is the operator's gift of a
// plan that Stripe does not know: it has no Stripe IDs and is never
// charged. billing_interval is "month" or "year", set from the
// Stripe price by the webhook; a grant has none. past_due_since is
// when Stripe first said past_due, to count the grace period; it is
// null in any other status.
// -----
export const tenantSubscriptions = pgTable(
  "tenant_subscriptions",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => platformMasterPlans.id, { onDelete: "restrict" }),
    status: text("status").$type<SubscriptionStatusValue>().notNull(),
    source: text("source").$type<SubscriptionSourceValue>().notNull(),
    billingInterval: text("billing_interval").$type<BillingIntervalValue>(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    pastDueSince: timestamp("past_due_since", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => ({
    uqStripeSubscription: uniqueIndex("uq_tenant_subscriptions_stripe_subscription_id")
      .on(t.stripeSubscriptionId)
      .where(sql`${t.stripeSubscriptionId} is not null`),
    chkStatus: check("tenant_subscriptions_status", sql`${t.status} in (${inList(SUBSCRIPTION_STATUS_VALUES)})`),
    chkSource: check("tenant_subscriptions_source", sql`${t.source} in (${inList(SUBSCRIPTION_SOURCE_VALUES)})`),
    chkBillingInterval: check(
      "tenant_subscriptions_billing_interval",
      sql`${t.billingInterval} is null or ${t.billingInterval} in (${inList(BILLING_INTERVAL_VALUES)})`,
    ),
    chkGrantHasNoStripe: check(
      "tenant_subscriptions_grant_has_no_stripe",
      sql`(${t.source} = 'grant') = (${t.stripeSubscriptionId} is null and ${t.stripeCustomerId} is null)`,
    ),
    chkPastDueSince: check(
      "tenant_subscriptions_past_due_since",
      sql`${t.pastDueSince} is null or ${t.status} = 'past_due'`,
    ),
  }),
);

export type TTenantSubscription = typeof tenantSubscriptions.$inferSelect;
