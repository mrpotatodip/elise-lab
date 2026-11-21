import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { InternalServiceError, ValidationError } from "#/lib/errors";
import { handleStripeEventSvc, StripeEventSchema } from "#/modules/stripe/handlers";
import { stripeWebhookDoc } from "#/modules/stripe/openapi";
import { stripeSignatureValid } from "#/modules/stripe/utils";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/webhook", stripeWebhookDoc, async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new InternalServiceError("Stripe is not configured");
  const rawBody = await c.req.text();
  if (!(await stripeSignatureValid(rawBody, c.req.header("stripe-signature"), secret, Math.floor(Date.now() / 1000)))) {
    throw new ValidationError("The Stripe signature is not valid");
  }
  const event = StripeEventSchema.safeParse(JSON.parse(rawBody));
  if (!event.success) throw new ValidationError("The event is not a Stripe event");
  const deps = c.get("deps");
  const data = await deps.withOwner(c, (db) => runEffect(handleStripeEventSvc(db, deps.stripe(c.env), event.data, new Date())));
  return c.json({ data, error: null });
});

export default app;
