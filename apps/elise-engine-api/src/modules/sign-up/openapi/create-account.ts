import { describeRoute } from "hono-openapi";
import { SignUpSchema } from "@repo/contracts/elise";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, bash, envelope, errorResponses, json, jsonResponse, routeText } from "#/lib/openapi";

export const createAccountDoc = describeRoute({
  tags: ["sign-up"],
  summary: "Sign up and start an account",
  description: routeText({
    context:
      "A visitor starts their own account. One request creates the Person, their login, the Tenant and the membership with the role `tenant_admin`. No login and no code are needed. Too many requests from one address get 429.",
    steps: [
      "The server checks the Turnstile token in `turnstileToken` with Cloudflare. A missing or failed token gets the same 409 as any other refusal, with no reason.",
      "The server checks that the email has no login yet. If it has, the answer is 409.",
      "The server makes the Tenant slug from the account name, for example `Acme Labs` becomes `acme-labs`. If it is taken, it adds `-2`, `-3` and so on.",
      "The server saves everything in one transaction. If any step fails, nothing is saved.",
      "The server returns the login ID and the new Tenant. The login is not signed in yet: call `POST /auth/sign-in/email` next.",
    ],
    example: [
      "A new owner signs up:",
      bash(
        `curl -X POST ${EXAMPLE_BASE_URL}/sign-up -H "Content-Type: application/json" -d '{"firstName":"Ada","lastName":"Rossi","email":"ada@example.com","password":"correct-horse-battery","accountName":"Acme Labs","timezone":"Europe/Rome"}'`,
      ),
      json(
        `{\n  "data": {\n    "userId": "3f2a9c1e-7b64-4d0a-8e5f-1c2d3e4f5a6b",\n    "tenant": { "id": "${EXAMPLE_ACCOUNT_ID}", "name": "Acme Labs", "slug": "acme-labs", "timezone": "Europe/Rome", "role": "tenant_admin", "roleLabel": "Tenant admin", "powers": [] }\n  },\n  "error": null\n}`,
      ),
    ],
  }),
  responses: {
    201: jsonResponse("The new login and its account, with the role `tenant_admin`.", envelope(SignUpSchema)),
    ...errorResponses(400, 409, 429),
  },
});
