import { eq, isNull, notInArray, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { SubscriptionStatusValue } from "@repo/contracts/elise";
import { platformMasterPlans, tenants, tenantSubscriptions } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { STRIPE_SUBSCRIPTION_LIVE_STATUSES } from "#/modules/stripe/constants";

export const tenantExistsEffect = (db: AppDbType, tenantId: string): Effect.Effect<boolean, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [found] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId));
      return found !== undefined;
    },
    catch: toDbError,
  });

export const tenantOfStripeCustomerEffect = (db: AppDbType, customerId: string): Effect.Effect<string | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [found] = await db.select({ tenantId: tenantSubscriptions.tenantId }).from(tenantSubscriptions).where(eq(tenantSubscriptions.stripeCustomerId, customerId));
      return found?.tenantId ?? null;
    },
    catch: toDbError,
  });

export const planIdOfPriceEffect = (db: AppDbType, priceId: string): Effect.Effect<string | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [found] = await db.select({ id: platformMasterPlans.id }).from(platformMasterPlans).where(eq(platformMasterPlans.stripePriceId, priceId));
      return found?.id ?? null;
    },
    catch: toDbError,
  });

export type StripeSubscriptionRow = {
  tenantId: string;
  planId: string;
  status: SubscriptionStatusValue;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export const upsertStripeSubscriptionEffect = (db: AppDbType, row: StripeSubscriptionRow, now: Date): Effect.Effect<boolean, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const pastDue = row.status === "past_due";
      const stored = tenantSubscriptions.stripeSubscriptionId;
      const written = await db
        .insert(tenantSubscriptions)
        .values({ ...row, source: "stripe", pastDueSince: pastDue ? now : null })
        .onConflictDoUpdate({
          target: tenantSubscriptions.tenantId,
          setWhere: or(isNull(stored), eq(stored, row.stripeSubscriptionId), row.status === "canceled" ? undefined : notInArray(tenantSubscriptions.status, [...STRIPE_SUBSCRIPTION_LIVE_STATUSES])),
          set: {
            planId: row.planId,
            status: row.status,
            source: "stripe",
            stripeCustomerId: row.stripeCustomerId,
            stripeSubscriptionId: row.stripeSubscriptionId,
            currentPeriodEnd: row.currentPeriodEnd,
            cancelAtPeriodEnd: row.cancelAtPeriodEnd,
            pastDueSince: pastDue ? sql`coalesce(${tenantSubscriptions.pastDueSince}, ${now.toISOString()}::timestamptz)` : null,
            updatedAt: now,
          },
        })
        .returning({ tenantId: tenantSubscriptions.tenantId });
      return written.length > 0;
    },
    catch: toDbError,
  });
