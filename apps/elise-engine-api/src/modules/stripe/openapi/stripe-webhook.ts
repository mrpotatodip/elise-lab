import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { EXAMPLE_BASE_URL, bash, envelope, errorResponses, jsonResponse, routeText } from "#/lib/openapi";

export const stripeWebhookDoc = describeRoute({
  tags: ["stripe"],
  summary: "Stripe's webhook",
  description: routeText({
    context:
      "Stripe calls this route when a Subscription changes. It is the only thing that changes an Account's Subscription. The `stripe-signature` header is the only credential. Events other than checkout completed, subscription created, updated and deleted, and invoice payment failed get a 200 and are ignored.",
    steps: [
      "The Worker checks the signature of the raw body against the webhook secret and refuses with 400 when it does not match or is older than five minutes.",
      "The Worker reads the subscription the event names back from Stripe and finds its Account by the Account ID the checkout stamped on it, then by the Stripe customer.",
      "The Worker stores the Account's Subscription row from it, in one statement, so a repeated event changes nothing.",
    ],
    example: [
      "Stripe sends (the CLI can forward test events):",
      bash(`stripe listen --forward-to ${EXAMPLE_BASE_URL}/stripe/webhook`),
    ],
  }),
  responses: {
    200: jsonResponse(
      "The event was read; handled says whether it changed a Subscription.",
      envelope(z.object({ handled: z.boolean() })),
    ),
    ...errorResponses(400),
  },
});
