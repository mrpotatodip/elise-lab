import { Effect } from "effect";
import type { BillingIntervalValue, PlanChangeResult, PlanSessionUrl } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { Conflict, Invalid, NotFound, toExternalError, type DbError, type ExternalError } from "#/lib/effect-query";
import { billingContextEffect, planByKeyEffect, seatsEffect } from "#/modules/plan/queries";
import type { PlanByKey } from "#/modules/plan/types";
import type { StripeGateway } from "#/modules/stripe/types";

const planPageUrl = (dashboardUrl: string, query = ""): string =>
  `${dashboardUrl.replace(/\/+$/, "")}/settings/plan${query}`;

const offeredPlanEffect = (
  db: AppDbType,
  planKey: string,
  interval: BillingIntervalValue,
): Effect.Effect<PlanByKey & { priceId: string }, DbError | Invalid> =>
  Effect.gen(function* () {
    const plan = yield* planByKeyEffect(db, planKey);
    if (!plan || !plan.enabled)
      return yield* Effect.fail(new Invalid({ message: `The plan "${planKey}" is not offered` }));
    const [priceId, missing] =
      interval === "year"
        ? [plan.yearlyPriceId, `The ${plan.label} plan has no yearly price`]
        : [plan.priceId, `The ${plan.label} plan has no Stripe price yet`];
    if (!priceId) return yield* Effect.fail(new Invalid({ message: missing }));
    return { ...plan, priceId };
  });

const seatCapEffect = (
  db: AppDbType,
  accountId: string,
  target: PlanByKey,
  now: Date,
): Effect.Effect<void, DbError | Conflict> =>
  Effect.gen(function* () {
    const { members, pendingInvites } = yield* seatsEffect(db, accountId, now);
    if (members + pendingInvites > target.maxMembers) {
      return yield* Effect.fail(
        new Conflict({
          message: `This account has ${members} ${members === 1 ? "person" : "people"} and ${pendingInvites} pending ${pendingInvites === 1 ? "invite" : "invites"}, and ${target.label} holds ${target.maxMembers}. Remove members or revoke invites first.`,
        }),
      );
    }
  });

export const startPlanCheckoutSvc = (
  db: AppDbType,
  stripe: StripeGateway,
  dashboardUrl: string,
  accountId: string,
  userId: string,
  planKey: string,
  interval: BillingIntervalValue,
  now: Date,
): Effect.Effect<PlanSessionUrl, DbError | Conflict | Invalid | ExternalError> =>
  Effect.gen(function* () {
    const context = yield* billingContextEffect(db, accountId, userId);
    const { subscription } = context;
    if (subscription?.source === "stripe" && (subscription.status === "active" || subscription.status === "past_due")) {
      return yield* Effect.fail(
        new Conflict({ message: "This account already has a subscription. Manage it in the billing portal." }),
      );
    }
    const target = yield* offeredPlanEffect(db, planKey, interval);
    yield* seatCapEffect(db, accountId, target, now);
    const { priceId } = target;
    const known =
      subscription?.stripeCustomerId ??
      (yield* Effect.tryPromise({ try: () => stripe.findCustomer({ accountId }), catch: toExternalError }))?.id;
    const customerId =
      known ??
      (yield* Effect.tryPromise({
        try: () => stripe.createCustomer({ name: context.accountName, email: context.adminEmail, accountId }),
        catch: toExternalError,
      })).id;
    return yield* Effect.tryPromise({
      try: () =>
        stripe.createCheckoutSession({
          customerId,
          accountId,
          priceId,
          successUrl: planPageUrl(dashboardUrl, "?checkout=success"),
          cancelUrl: planPageUrl(dashboardUrl, "?checkout=cancelled"),
        }),
      catch: toExternalError,
    });
  });

export const changePlanSvc = (
  db: AppDbType,
  stripe: StripeGateway,
  accountId: string,
  userId: string,
  planKey: string,
  interval: BillingIntervalValue | undefined,
  now: Date,
): Effect.Effect<PlanChangeResult, DbError | Conflict | Invalid | ExternalError> =>
  Effect.gen(function* () {
    const { subscription } = yield* billingContextEffect(db, accountId, userId);
    if (subscription?.source !== "stripe" || subscription.status !== "active" || !subscription.stripeSubscriptionId) {
      return yield* Effect.fail(
        new Conflict({ message: "Only an account with an active Stripe subscription can change plan." }),
      );
    }
    const current = subscription.billingInterval ?? "month";
    const requested = interval ?? current;
    const target = yield* offeredPlanEffect(db, planKey, requested);
    const samePlan = target.id === subscription.planId;
    if (samePlan && requested === current) {
      return yield* Effect.fail(
        new Conflict({
          message: `This account is already on the ${target.label} plan, billed ${current === "year" ? "yearly" : "monthly"}.`,
        }),
      );
    }
    if (requested === "month" && current === "year") {
      return yield* Effect.fail(
        new Conflict({
          message:
            "A yearly subscription cannot switch to monthly. Cancel it in the billing portal, and subscribe monthly when the paid year ends.",
        }),
      );
    }
    if (requested !== current && !samePlan) {
      return yield* Effect.fail(
        new Conflict({ message: "Change the plan or the billing interval, not both at once." }),
      );
    }
    if (!samePlan) yield* seatCapEffect(db, accountId, target, now);
    const subscriptionId = subscription.stripeSubscriptionId;
    yield* Effect.tryPromise({
      try: () => stripe.changeSubscriptionPrice({ subscriptionId, priceId: target.priceId }),
      catch: toExternalError,
    });
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
    return yield* Effect.tryPromise({
      try: () => stripe.createPortalSession({ customerId, returnUrl: planPageUrl(dashboardUrl) }),
      catch: toExternalError,
    });
  });
