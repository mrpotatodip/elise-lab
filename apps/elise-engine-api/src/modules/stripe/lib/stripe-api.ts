import { z } from "zod";
import type { StripeGateway } from "#/modules/stripe/types";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2025-04-30.basil";

const IdSchema = z.object({ id: z.string() });
const UrlSchema = z.object({ url: z.string() });
const SubscriptionSchema = z.object({
  id: z.string(),
  customer: z.string(),
  status: z.string(),
  cancel_at_period_end: z.boolean(),
  metadata: z.record(z.string(), z.string()).default({}),
  current_period_end: z.number().optional(),
  items: z.object({ data: z.array(z.object({ price: z.object({ id: z.string() }), current_period_end: z.number().optional() })) }),
});

const parse = async <S extends z.ZodType>(response: Response, schema: S, what: string): Promise<z.infer<S>> => {
  if (!response.ok) throw new Error(`Stripe ${what} answered ${response.status}`);
  return schema.parse(await response.json());
};

export const stripeGateway = (secretKey: string): StripeGateway => {
  const headers = { authorization: `Bearer ${secretKey}`, "stripe-version": STRIPE_VERSION };
  const get = async <S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> => parse(await fetch(`${STRIPE_API}${path}`, { headers }), schema, `GET ${path}`);
  const call = async <S extends z.ZodType>(method: "POST", path: string, schema: S, form: URLSearchParams): Promise<z.infer<S>> =>
    parse(await fetch(`${STRIPE_API}${path}`, { method, headers: { ...headers, "content-type": "application/x-www-form-urlencoded" }, body: form.toString() }), schema, `${method} ${path}`);

  return {
    createCustomer: ({ name, email, accountId }) => {
      const form = new URLSearchParams({ name, "metadata[accountId]": accountId });
      if (email) form.set("email", email);
      return call("POST", "/customers", IdSchema, form);
    },
    createCheckoutSession: ({ customerId, accountId, priceId, successUrl, cancelUrl }) =>
      call(
        "POST",
        "/checkout/sessions",
        UrlSchema,
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
    createPortalSession: ({ customerId, returnUrl }) => call("POST", "/billing_portal/sessions", UrlSchema, new URLSearchParams({ customer: customerId, return_url: returnUrl })),
    retrieveSubscription: async (subscriptionId) => {
      const found = await get(`/subscriptions/${encodeURIComponent(subscriptionId)}`, SubscriptionSchema);
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
