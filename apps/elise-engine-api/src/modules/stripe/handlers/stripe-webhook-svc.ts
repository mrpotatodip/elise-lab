import { Effect } from "effect";
import { z } from "zod";
import type { AppDbType } from "#/lib/db-connection";
import { toExternalError, toParseError, type DbError, type ExternalError, type ParseError } from "#/lib/effect-query";
import { planIdOfPriceEffect, tenantExistsEffect, tenantOfStripeCustomerEffect, upsertStripeSubscriptionEffect } from "#/modules/stripe/queries";
import type { StripeGateway } from "#/modules/stripe/types";
import { subscriptionStatusOf } from "#/modules/stripe/utils";

export const StripeEventSchema = z.object({ type: z.string(), data: z.object({ object: z.unknown() }) });

const SUBSCRIPTION_EVENTS = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
const SESSION_EVENTS = ["checkout.session.completed", "invoice.payment_failed"];

const EventObjectSchema = z.object({
  id: z.string().optional(),
  customer: z.string().nullish(),
  client_reference_id: z.string().nullish(),
  subscription: z.string().nullish(),
  parent: z.object({ subscription_details: z.object({ subscription: z.string().nullish() }).nullish() }).nullish(),
});

export const handleStripeEventSvc = (db: AppDbType, stripe: StripeGateway, event: z.infer<typeof StripeEventSchema>, now: Date): Effect.Effect<{ handled: boolean }, DbError | ExternalError | ParseError> =>
  Effect.gen(function* () {
    const isSubscriptionEvent = SUBSCRIPTION_EVENTS.includes(event.type);
    if (!isSubscriptionEvent && !SESSION_EVENTS.includes(event.type)) return { handled: false };
    const object = yield* Effect.try({ try: () => EventObjectSchema.parse(event.data.object), catch: toParseError });
    const subscriptionId = isSubscriptionEvent ? object.id : (object.subscription ?? object.parent?.subscription_details?.subscription);
    if (!subscriptionId) return { handled: false };

    const subscription = yield* Effect.tryPromise({ try: () => stripe.retrieveSubscription(subscriptionId), catch: toExternalError });
    if (!subscription.priceId) return { handled: false };
    const planId = yield* planIdOfPriceEffect(db, subscription.priceId);
    if (!planId) return { handled: false };

    const hinted = [object.client_reference_id, subscription.accountId].find((id) => z.uuid().safeParse(id).success);
    const hintedExists = hinted ? yield* tenantExistsEffect(db, hinted) : false;
    const tenantId = hinted && hintedExists ? hinted : yield* tenantOfStripeCustomerEffect(db, subscription.customerId);
    if (!tenantId) return { handled: false };

    yield* upsertStripeSubscriptionEffect(
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
    return { handled: true };
  });
