import { Effect } from "effect";
import type { PlanSessionUrl } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { Conflict, Invalid, NotFound, toExternalError, type DbError, type ExternalError } from "#/lib/effect-query";
import { billingContextEffect } from "#/modules/plan/queries";
import type { StripeGateway } from "#/modules/stripe/types";

const planPageUrl = (dashboardUrl: string, query = ""): string => `${dashboardUrl.replace(/\/+$/, "")}/settings/plan${query}`;

export const startPlanCheckoutSvc = (
  db: AppDbType,
  stripe: StripeGateway,
  dashboardUrl: string,
  accountId: string,
  userId: string,
): Effect.Effect<PlanSessionUrl, DbError | Conflict | Invalid | ExternalError> =>
  Effect.gen(function* () {
    const context = yield* billingContextEffect(db, accountId, userId);
    const { subscription } = context;
    if (subscription?.source === "stripe" && (subscription.status === "active" || subscription.status === "past_due")) {
      return yield* Effect.fail(new Conflict({ message: "This account already has a subscription. Manage it in the billing portal." }));
    }
    if (!context.priceId) return yield* Effect.fail(new Invalid({ message: "The Runner plan has no Stripe price yet" }));
    const priceId = context.priceId;
    const known = subscription?.stripeCustomerId ?? (yield* Effect.tryPromise({ try: () => stripe.findCustomer({ accountId }), catch: toExternalError }))?.id;
    const customerId = known ?? (yield* Effect.tryPromise({ try: () => stripe.createCustomer({ name: context.accountName, email: context.adminEmail, accountId }), catch: toExternalError })).id;
    return yield* Effect.tryPromise({
      try: () =>
        stripe.createCheckoutSession({ customerId, accountId, priceId, successUrl: planPageUrl(dashboardUrl, "?checkout=success"), cancelUrl: planPageUrl(dashboardUrl, "?checkout=cancelled") }),
      catch: toExternalError,
    });
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
