import { z } from "zod";

export const StripeEventSchema = z.object({ type: z.string(), data: z.object({ object: z.unknown() }) });

export const StripeEventObjectSchema = z.object({
  id: z.string().optional(),
  customer: z.string().nullish(),
  client_reference_id: z.string().nullish(),
  subscription: z.string().nullish(),
  parent: z.object({ subscription_details: z.object({ subscription: z.string().nullish() }).nullish() }).nullish(),
});

export const StripeIdResponseSchema = z.object({ id: z.string() });
export const StripeUrlResponseSchema = z.object({ url: z.string() });
export const StripeCustomerSearchResponseSchema = z.object({ data: z.array(StripeIdResponseSchema) });
export const StripeSubscriptionResponseSchema = z.object({
  id: z.string(),
  customer: z.string(),
  status: z.string(),
  cancel_at_period_end: z.boolean(),
  metadata: z.record(z.string(), z.string()).default({}),
  current_period_end: z.number().optional(),
  items: z.object({ data: z.array(z.object({ id: z.string(), price: z.object({ id: z.string() }), current_period_end: z.number().optional() })) }),
});

export type StripeEvent = z.infer<typeof StripeEventSchema>;
