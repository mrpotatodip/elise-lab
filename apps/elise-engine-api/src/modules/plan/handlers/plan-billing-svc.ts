import { Effect } from "effect";
import { PlanCheckoutBodySchema, type PlanChangeResult, type PlanCheckoutBody, type PlanSessionUrl } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { Conflict, Invalid, NotFound, toExternalError, type DbError, type ExternalError } from "#/lib/effect-query";
import { billingContextEffect, planByKeyEffect, seatsEffect, type PlanByKey } from "#/modules/plan/queries";
import type { StripeGateway } from "#/modules/stripe/types";

const planPageUrl = (dashboardUrl: string, query = ""): string => `${dashboardUrl.replace(/\/+$/, "")}/settings/plan${query}`;

export const parsePlanCheckoutBodySvc = (rawBody: string): Effect.Effect<PlanCheckoutBody, Invalid> =>
  Effect.try({ try: () => PlanCheckoutBodySchema.parse(rawBody.trim() === "" ? {} : JSON.parse(rawBody)), catch: () => new Invalid({ message: "planKey must be a plan key" }) });

const offeredPlanEffect = (db: AppDbType, planKey: string): Effect.Effect<PlanByKey & { priceId: string }, DbError | Invalid> =>
  Effect.gen(function* () {
    const plan = yield* planByKeyEffect(db, planKey);
    if (!plan || !plan.enabled) return yield* Effect.fail(new Invalid({ message: `The plan "${planKey}" is not offered` }));
    if (!plan.priceId) return yield* Effect.fail(new Invalid({ message: `The ${plan.label} plan has no Stripe price yet` }));
    return { ...plan, priceId: plan.priceId };
  });

export const startPlanCheckoutSvc = (
  db: AppDbType,
  stripe: StripeGateway,
  dashboardUrl: string,
  accountId: string,
  userId: string,
  planKey: string,
): Effect.Effect<PlanSessionUrl, DbError | Conflict | Invalid | ExternalError> =>
  Effect.gen(function* () {
    const context = yield* billingContextEffect(db, accountId, userId);
    const { subscription } = context;
    if (subscription?.source === "stripe" && (subscription.status === "active" || subscription.status === "past_due")) {
      return yield* Effect.fail(new Conflict({ message: "This account already has a subscription. Manage it in the billing portal." }));
    }
    const { priceId } = yield* offeredPlanEffect(db, planKey);
    const known = subscription?.stripeCustomerId ?? (yield* Effect.tryPromise({ try: () => stripe.findCustomer({ accountId }), catch: toExternalError }))?.id;
    const customerId = known ?? (yield* Effect.tryPromise({ try: () => stripe.createCustomer({ name: context.accountName, email: context.adminEmail, accountId }), catch: toExternalError })).id;
    return yield* Effect.tryPromise({
      try: () =>
        stripe.createCheckoutSession({ customerId, accountId, priceId, successUrl: planPageUrl(dashboardUrl, "?checkout=success"), cancelUrl: planPageUrl(dashboardUrl, "?checkout=cancelled") }),
      catch: toExternalError,
    });
  });

export const changePlanSvc = (
  db: AppDbType,
  stripe: StripeGateway,
  accountId: string,
  userId: string,
  planKey: string,
  now: Date,
): Effect.Effect<PlanChangeResult, DbError | Conflict | Invalid | ExternalError> =>
  Effect.gen(function* () {
    const { subscription } = yield* billingContextEffect(db, accountId, userId);
    if (subscription?.source !== "stripe" || subscription.status !== "active" || !subscription.stripeSubscriptionId) {
      return yield* Effect.fail(new Conflict({ message: "Only an account with an active Stripe subscription can change plan." }));
    }
    const target = yield* offeredPlanEffect(db, planKey);
    if (target.id === subscription.planId) return yield* Effect.fail(new Conflict({ message: `This account is already on the ${target.label} plan.` }));
    const { members, pendingInvites } = yield* seatsEffect(db, accountId, now);
    if (members + pendingInvites > target.maxMembers) {
      return yield* Effect.fail(
        new Conflict({
          message: `This account has ${members} people and ${pendingInvites} pending invites, and ${target.label} holds ${target.maxMembers}. Remove members or revoke invites first.`,
        }),
      );
    }
    const subscriptionId = subscription.stripeSubscriptionId;
    yield* Effect.tryPromise({ try: () => stripe.changeSubscriptionPrice({ subscriptionId, priceId: target.priceId }), catch: toExternalError });
    return { planKey: target.key };
  });

export const openBillingPortalSvc = (
  db: AppDbType,
  stripe: StripeGateway,
  dashboardUrl: string,
  accountId: string,
  userId: string,
): Effect.Effect<PlanSessionUrl, DbError | NotFound | ExternalError> =>
  Effect.gen(function* () {
    const { subscription } = yield* billingContextEffect(db, accountId, userId);
    const customerId = subscription?.stripeCustomerId;
    if (!customerId) return yield* Effect.fail(new NotFound({ message: "This account has no billing record yet" }));
    return yield* Effect.tryPromise({ try: () => stripe.createPortalSession({ customerId, returnUrl: planPageUrl(dashboardUrl) }), catch: toExternalError });
  });
