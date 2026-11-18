import { describeRoute } from "hono-openapi";
import { PlanOffersSchema } from "@repo/contracts/elise";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, SERVICE_SECURITY, bash, envelope, errorResponses, json, jsonResponse, routeText } from "#/lib/openapi";

const EXAMPLE = `{ "data": [{ "key": "runner", "label": "Runner", "monthlyPriceUsd": 35, "includedCreditUsd": 0, "maxMembers": 5 }], "error": null }`;

export const getPlanOffersDoc = describeRoute({
  tags: ["usage"],
  summary: "The plans an account may pick",
  security: SERVICE_SECURITY,
  description: routeText({
    context: "The plans a person may subscribe to. A plan the operator marked not offered stays in the catalogue for the accounts that hold it, and is not listed here.",
    steps: [
      "The Worker checks the signed-in login and that its role in the account holds the plan read Power.",
      "The Worker reads the catalogue rows that are offered, cheapest first.",
      "The Worker returns them.",
    ],
    example: ["List the plans:", bash(`curl ${EXAMPLE_BASE_URL}/usage/plan/offers \\`, '  -H "cookie: $SESSION_COOKIE" \\', `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`), json(EXAMPLE)],
  }),
  responses: { 200: jsonResponse("The plans on offer.", envelope(PlanOffersSchema)), ...errorResponses(400, 401, 403) },
});
