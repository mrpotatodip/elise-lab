import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { InternalServiceError, ValidationError } from "#/lib/errors";
import { STRIPE_NOT_CONFIGURED_MESSAGE } from "#/modules/stripe/constants";
import { handleStripeEventSvc, parseStripeEventSvc } from "#/modules/stripe/handlers";
import { stripeWebhookDoc } from "#/modules/stripe/openapi";
import { stripeSignatureValid } from "#/modules/stripe/utils";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/webhook", stripeWebhookDoc, async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new InternalServiceError(STRIPE_NOT_CONFIGURED_MESSAGE);
  const rawBody = await c.req.text();
  if (!(await stripeSignatureValid(rawBody, c.req.header("stripe-signature"), secret, Math.floor(Date.now() / 1000)))) {
    throw new ValidationError("The Stripe signature is not valid");
  }
  const event = await runEffect(parseStripeEventSvc(rawBody));
  const deps = c.get("deps");
  const data = await deps.withOwner(c, (db) => runEffect(handleStripeEventSvc(db, deps.stripe(c.env), event, new Date())));
  return c.json({ data, error: null });
});

export default app;
