import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { PlanDetails, PlanOffer, SubscriptionSourceValue, SubscriptionStatusValue } from "@repo/contracts/elise";
import { authUser, partyRoles, platformMasterPlans, tenants, tenantSubscriptions, tenantTeamInvites } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { monthSpendEffect, monthStartOf } from "#/modules/usage";

const RUNNER_PLAN_KEY = "runner";

// -----
// The plans an Account may pick: the rows of the catalogue not
// marked not offered (enabled false), cheapest first. Rows stay
// when they stop being offered, because subscriptions point at them.
// -----
export const offeredPlansEffect = (db: AppDbType): Effect.Effect<PlanOffer[], DbError> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .select({
          key: platformMasterPlans.key,
          label: platformMasterPlans.label,
          price: platformMasterPlans.monthlyPriceUsd,
          credit: platformMasterPlans.includedCreditUsd,
          maxMembers: platformMasterPlans.maxMembers,
        })
        .from(platformMasterPlans)
        .where(eq(platformMasterPlans.enabled, true))
        .orderBy(asc(platformMasterPlans.monthlyPriceUsd));
      return rows.map((row) => ({ key: row.key, label: row.label, monthlyPriceUsd: Number(row.price), includedCreditUsd: Number(row.credit), maxMembers: row.maxMembers }));
    },
    catch: toDbError,
  });

export type BillingContext = {
  accountName: string;
  adminEmail: string | null;
  priceId: string | null;
  subscription: { source: SubscriptionSourceValue; status: SubscriptionStatusValue; stripeCustomerId: string | null } | null;
};

export const billingContextEffect = (db: AppDbType, tenantId: string, userId: string): Effect.Effect<BillingContext, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [account] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
      const [admin] = await db.select({ email: authUser.email }).from(authUser).where(eq(authUser.id, userId));
      const [runner] = await db.select({ priceId: platformMasterPlans.stripePriceId }).from(platformMasterPlans).where(eq(platformMasterPlans.key, RUNNER_PLAN_KEY));
      const [subscription] = await db
        .select({ source: tenantSubscriptions.source, status: tenantSubscriptions.status, stripeCustomerId: tenantSubscriptions.stripeCustomerId })
        .from(tenantSubscriptions)
        .where(eq(tenantSubscriptions.tenantId, tenantId));
      return { accountName: account?.name ?? "", adminEmail: admin?.email ?? null, priceId: runner?.priceId ?? null, subscription: subscription ?? null };
    },
    catch: toDbError,
  });

// -----
// What the Plan page shows: the plan, how the subscription stands,
// the month's scans, and the people the plan holds. The seat count
// is the one the invite limit uses: people in the account plus
// invites still waiting. An account with no plan has no plan or
// subscription fields, but still has its seats and scans.
// -----
export const planDetailsEffect = (db: AppDbType, tenantId: string, now: Date): Effect.Effect<PlanDetails, DbError> =>
  Effect.gen(function* () {
    const row = yield* Effect.tryPromise({
      try: async () => {
        const [found] = await db
          .select({
            key: platformMasterPlans.key,
            label: platformMasterPlans.label,
            price: platformMasterPlans.monthlyPriceUsd,
            credit: platformMasterPlans.includedCreditUsd,
            carryCap: platformMasterPlans.carryCapUsd,
            keySource: platformMasterPlans.keySource,
            allowance: platformMasterPlans.monthlyScanAllowance,
            maxMembers: platformMasterPlans.maxMembers,
            status: tenantSubscriptions.status,
            source: tenantSubscriptions.source,
            periodEnd: tenantSubscriptions.currentPeriodEnd,
            cancelAtPeriodEnd: tenantSubscriptions.cancelAtPeriodEnd,
          })
          .from(tenantSubscriptions)
          .innerJoin(platformMasterPlans, eq(platformMasterPlans.id, tenantSubscriptions.planId))
          .where(eq(tenantSubscriptions.tenantId, tenantId));
        return found;
      },
      catch: toDbError,
    });
    const seats = yield* Effect.tryPromise({
      try: async () => {
        const [{ members }] = await db
          .select({ members: sql<number>`count(distinct ${partyRoles.partyId})::int` })
          .from(partyRoles)
          .where(eq(partyRoles.tenantId, tenantId));
        const [{ pendingInvites }] = await db
          .select({ pendingInvites: sql<number>`count(*)::int` })
          .from(tenantTeamInvites)
          .where(
            and(eq(tenantTeamInvites.tenantId, tenantId), isNull(tenantTeamInvites.revokedAt), isNull(tenantTeamInvites.acceptedAt), gt(tenantTeamInvites.expiresAt, now)),
          );
        return { members, pendingInvites };
      },
      catch: toDbError,
    });
    const { scans } = yield* monthSpendEffect(db, tenantId, monthStartOf(now));
    return {
      plan: row
        ? {
            key: row.key,
            label: row.label,
            monthlyPriceUsd: Number(row.price),
            includedCreditUsd: Number(row.credit),
            carryCapUsd: row.carryCap === null ? null : Number(row.carryCap),
            keySource: row.keySource,
            scanAllowance: row.allowance,
            maxMembers: row.maxMembers,
          }
        : null,
      status: row?.status ?? null,
      source: row?.source ?? null,
      currentPeriodEnd: row?.periodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
      scans,
      seats,
    };
  });
