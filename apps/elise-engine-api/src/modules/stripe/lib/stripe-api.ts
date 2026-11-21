import { z } from "zod";
import { STRIPE_API_BASE_URL, STRIPE_API_VERSION } from "#/modules/stripe/constants";
import {
  StripeCustomerSearchResponseSchema,
  StripeIdResponseSchema,
  StripeSubscriptionResponseSchema,
  StripeUrlResponseSchema,
} from "#/modules/stripe/schemas";
import type { StripeGateway } from "#/modules/stripe/types";


const parse = async <S extends z.ZodType>(response: Response, schema: S, what: string): Promise<z.infer<S>> => {
  if (!response.ok) throw new Error(`Stripe ${what} answered ${response.status}`);
  return schema.parse(await response.json());
};

export const stripeGateway = (secretKey: string): StripeGateway => {
  const headers = { authorization: `Bearer ${secretKey}`, "stripe-version": STRIPE_API_VERSION };
  const get = async <S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> => parse(await fetch(`${STRIPE_API_BASE_URL}${path}`, { headers }), schema, `GET ${path}`);
  const post = async <S extends z.ZodType>(path: string, schema: S, form: URLSearchParams, idempotencyKey?: string): Promise<z.infer<S>> => {
    const postHeaders = new Headers(headers);
    postHeaders.set("content-type", "application/x-www-form-urlencoded");
    if (idempotencyKey) postHeaders.set("idempotency-key", idempotencyKey);
    return parse(await fetch(`${STRIPE_API_BASE_URL}${path}`, { method: "POST", headers: postHeaders, body: form.toString() }), schema, `POST ${path}`);
  };

  return {
    findCustomer: async ({ accountId }) => {
      const found = await get(`/customers/search?query=${encodeURIComponent(`metadata['accountId']:'${accountId}'`)}&limit=1`, StripeCustomerSearchResponseSchema);
      return found.data[0] ?? null;
    },
    createCustomer: ({ name, email, accountId }) => {
      const form = new URLSearchParams({ name, "metadata[accountId]": accountId });
      if (email) form.set("email", email);
      return post("/customers", StripeIdResponseSchema, form, `eliselab-customer-${accountId}`);
    },
    createCheckoutSession: ({ customerId, accountId, priceId, successUrl, cancelUrl }) =>
      post(
        "/checkout/sessions",
        StripeUrlResponseSchema,
        new URLSearchParams({
        mode: "subscription",
        customer: customerId,
        client_reference_id: accountId,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        "payment_method_types[0]": "card",
        allow_promotion_codes: "false",
        "tax_id_collection[enabled]": "true",
        "customer_update[name]": "auto",
        "customer_update[address]": "auto",
        "subscription_data[metadata][accountId]": accountId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        }),
      ),
    createPortalSession: ({ customerId, returnUrl }) => post("/billing_portal/sessions", StripeUrlResponseSchema, new URLSearchParams({ customer: customerId, return_url: returnUrl })),
    changeSubscriptionPrice: async ({ subscriptionId, priceId }) => {
      const path = `/subscriptions/${encodeURIComponent(subscriptionId)}`;
      const found = await get(path, StripeSubscriptionResponseSchema);
      const item = found.items.data[0];
      if (!item) throw new Error(`Stripe subscription ${subscriptionId} has no item`);
      await post(path, StripeIdResponseSchema, new URLSearchParams({ "items[0][id]": item.id, "items[0][price]": priceId, proration_behavior: "create_prorations" }));
    },
    retrieveSubscription: async (subscriptionId) => {
      const found = await get(`/subscriptions/${encodeURIComponent(subscriptionId)}`, StripeSubscriptionResponseSchema);
      const item = found.items.data[0];
      const periodEnd = item?.current_period_end ?? found.current_period_end;
      return {
        id: found.id,
        customerId: found.customer,
        status: found.status,
        priceId: item?.price.id ?? null,
        currentPeriodEnd: periodEnd === undefined ? null : new Date(periodEnd * 1000),
        cancelAtPeriodEnd: found.cancel_at_period_end,
        accountId: found.metadata.accountId ?? null,
      };
    },
  };
};
