import { describeRoute } from "hono-openapi";
import { PlanSessionUrlSchema } from "@repo/contracts/elise";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, SERVICE_SECURITY, bash, envelope, errorResponses, jsonResponse, routeText } from "#/lib/openapi";

export const createPlanCheckoutDoc = describeRoute({
  tags: ["usage"],
  summary: "Start Stripe Checkout for the Runner plan",
  security: SERVICE_SECURITY,
  description: routeText({
    context:
      "An admin subscribes the account to the Runner plan. The answer is the Stripe Checkout URL to send the browser to. Checkout changes nothing here: the Subscription is written only when Stripe's webhook arrives.",
    steps: [
      "The Worker checks the signed-in login and that its role in the account holds the Power `company:plan:manage`.",
      "The Worker answers 409 while the account has an active or past-due Stripe Subscription.",
      "The Worker reuses the account's Stripe customer or makes one, then opens a Checkout session for the Runner plan's Stripe price, with the account ID attached.",
      "The Worker returns the session URL.",
    ],
    example: [
      "Start checkout:",
      bash(`curl -X POST ${EXAMPLE_BASE_URL}/usage/plan/checkout \\`, '  -H "cookie: $SESSION_COOKIE" \\', `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`),
    ],
  }),
  responses: { 200: jsonResponse("The Stripe Checkout URL.", envelope(PlanSessionUrlSchema)), ...errorResponses(400, 401, 403, 409) },
});

export const createPlanPortalDoc = describeRoute({
  tags: ["usage"],
  summary: "Open the Stripe Billing portal",
  security: SERVICE_SECURITY,
  description: routeText({
    context: "An admin updates the card, reads invoices or cancels at the end of the paid month. The answer is the Billing portal URL to send the browser to.",
    steps: [
      "The Worker checks the signed-in login and that its role in the account holds the Power `company:plan:manage`.",
      "The Worker answers 404 when the account has no Stripe customer yet.",
      "The Worker opens a portal session that returns to the Plan page, and returns its URL.",
    ],
    example: [
      "Open the portal:",
      bash(`curl -X POST ${EXAMPLE_BASE_URL}/usage/plan/portal \\`, '  -H "cookie: $SESSION_COOKIE" \\', `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`),
    ],
  }),
  responses: { 200: jsonResponse("The Billing portal URL.", envelope(PlanSessionUrlSchema)), ...errorResponses(400, 401, 403, 404) },
});
