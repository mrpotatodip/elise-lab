import { Effect } from "effect";
import { z } from "zod";
import type { AppDbType } from "#/lib/db-connection";
import { Invalid, toExternalError, toParseError, type DbError, type ExternalError, type ParseError } from "#/lib/effect-query";
import { STRIPE_WEBHOOK_SESSION_EVENTS, STRIPE_WEBHOOK_SUBSCRIPTION_EVENTS } from "#/modules/stripe/constants";
import { planIdOfPriceEffect, tenantExistsEffect, tenantOfStripeCustomerEffect, upsertStripeSubscriptionEffect } from "#/modules/stripe/queries";
import { StripeEventObjectSchema, StripeEventSchema, type StripeEvent } from "#/modules/stripe/schemas";
import type { StripeGateway } from "#/modules/stripe/types";
import { subscriptionStatusOf } from "#/modules/stripe/utils";

export const parseStripeEventSvc = (rawBody: string): Effect.Effect<StripeEvent, Invalid> =>
  Effect.try({ try: () => StripeEventSchema.parse(JSON.parse(rawBody)), catch: () => new Invalid({ message: "The event is not a Stripe event" }) });

export const handleStripeEventSvc = (db: AppDbType, stripe: StripeGateway, event: StripeEvent, now: Date): Effect.Effect<{ handled: boolean }, DbError | ExternalError | ParseError> =>
  Effect.gen(function* () {
    const isSubscriptionEvent = STRIPE_WEBHOOK_SUBSCRIPTION_EVENTS.includes(event.type);
    if (!isSubscriptionEvent && !STRIPE_WEBHOOK_SESSION_EVENTS.includes(event.type)) return { handled: false };
    const object = yield* Effect.try({ try: () => StripeEventObjectSchema.parse(event.data.object), catch: toParseError });
    const subscriptionId = isSubscriptionEvent ? object.id : (object.subscription ?? object.parent?.subscription_details?.subscription);
    if (!subscriptionId) return { handled: false };

    const subscription = yield* Effect.tryPromise({ try: () => stripe.retrieveSubscription(subscriptionId), catch: toExternalError });
    if (!subscription.priceId) return { handled: false };
    const planId = yield* planIdOfPriceEffect(db, subscription.priceId);
    if (!planId) {
      console.warn("Stripe event ignored: no plan has this stripe_price_id", { eventType: event.type, subscriptionId: subscription.id, priceId: subscription.priceId });
      return { handled: false };
    }

    const hinted = [object.client_reference_id, subscription.accountId].find((id) => z.uuid().safeParse(id).success);
    const hintedExists = hinted ? yield* tenantExistsEffect(db, hinted) : false;
    const tenantId = hinted && hintedExists ? hinted : yield* tenantOfStripeCustomerEffect(db, subscription.customerId);
    if (!tenantId) {
      console.warn("Stripe event ignored: no Account found for the subscription", { eventType: event.type, subscriptionId: subscription.id, customerId: subscription.customerId });
      return { handled: false };
    }

    const written = yield* upsertStripeSubscriptionEffect(
      db,
      {
        tenantId,
        planId,
        status: subscriptionStatusOf(subscription.status),
        stripeCustomerId: subscription.customerId,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      now,
    );
    return { handled: written };
  });
