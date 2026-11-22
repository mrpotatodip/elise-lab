import { describeRoute } from "hono-openapi";
import { PlanChangeResultSchema, PlanSessionUrlSchema } from "@repo/contracts/elise";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, SERVICE_SECURITY, bash, envelope, errorResponses, jsonResponse, routeText } from "#/lib/openapi";

export const createPlanCheckoutDoc = describeRoute({
  tags: ["usage"],
  summary: "Start Stripe Checkout for a plan",
  security: SERVICE_SECURITY,
  description: routeText({
    context:
      "An admin subscribes the account to a plan: the JSON body `{ \"planKey\": \"starter\" }` names it, and a request with no body means `runner`. The answer is the Stripe Checkout URL to send the browser to. Checkout changes nothing here: the Subscription is written only when Stripe's webhook arrives.",
    steps: [
      "The Worker checks the signed-in login and that its role in the account holds the Power `company:plan:manage`.",
      "The Worker answers 409 while the account has an active or past-due Stripe Subscription.",
      "The Worker answers 400 when the plan is unknown, not offered or has no Stripe price.",
      "The Worker answers 409, naming the counts, when the people plus pending invites exceed the plan's member limit.",
      "The Worker reuses the account's Stripe customer or makes one, then opens a Checkout session for the plan's Stripe price, with the account ID attached.",
      "The Worker returns the session URL.",
    ],
    example: [
      "Start checkout:",
      bash(`curl -X POST ${EXAMPLE_BASE_URL}/usage/plan/checkout \\`, '  -H "cookie: $SESSION_COOKIE" \\', `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`),
    ],
  }),
  responses: { 200: jsonResponse("The Stripe Checkout URL.", envelope(PlanSessionUrlSchema)), ...errorResponses(400, 401, 403, 409) },
});

export const changePlanDoc = describeRoute({
  tags: ["usage"],
  summary: "Change the plan of a subscribed account",
  security: SERVICE_SECURITY,
  description: routeText({
    context:
      "An admin moves an account with an active Stripe Subscription to another plan, for example Starter to Runner. The answer names the plan asked for. Only Stripe's webhook writes the Subscription, so the account moves to the new plan when the webhook arrives. Stripe prorates the difference on the next invoice.",
    steps: [
      "The Worker checks the signed-in login and that its role in the account holds the Power `company:plan:manage`.",
      "The Worker answers 409 unless the account has an active Stripe Subscription (an operator grant is refused), and when the account is already on the plan.",
      "The Worker answers 400 when the plan is unknown, not offered or has no Stripe price.",
      "The Worker answers 409, naming the counts, when the people plus pending invites exceed the plan's member limit.",
      "The Worker swaps the subscription item's price in Stripe and returns the plan key.",
    ],
    example: [
      "Move to Starter:",
      bash(`curl -X POST ${EXAMPLE_BASE_URL}/usage/plan/change \\`, '  -H "cookie: $SESSION_COOKIE" \\', `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}" \\`, '  -H "content-type: application/json" \\', `  -d '{"planKey":"starter"}'`),
    ],
  }),
  responses: { 200: jsonResponse("The plan the change was requested for.", envelope(PlanChangeResultSchema)), ...errorResponses(400, 401, 403, 409) },
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
