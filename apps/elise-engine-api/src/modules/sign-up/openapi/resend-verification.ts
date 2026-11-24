import { describeRoute } from "hono-openapi";
import { ResendVerificationSchema } from "@repo/contracts/elise";
import { EXAMPLE_BASE_URL, bash, envelope, errorResponses, json, jsonResponse, routeText } from "#/lib/openapi";

export const resendVerificationDoc = describeRoute({
  tags: ["sign-up"],
  summary: "Send the Verification email again",
  description: routeText({
    context:
      "A person who lost the Verification email asks for another. No session is needed. The answer is the same for any address, so it never says whether a login exists. Too many requests from one address get 429.",
    steps: [
      "The server queues one Verification email when the address belongs to a login that is not verified yet. Otherwise it queues nothing.",
      "Each address gets a few emails a minute. Past that, nothing is queued and the answer stays the same.",
      "The server answers `requested: true` in every case.",
    ],
    example: [
      "Ask for a new link:",
      bash(
        `curl -X POST ${EXAMPLE_BASE_URL}/sign-up/resend-verification -H "Content-Type: application/json" -d '{"email":"ada@example.com"}'`,
      ),
      json(`{\n  "data": { "requested": true },\n  "error": null\n}`),
    ],
  }),
  responses: {
    200: jsonResponse("The request was accepted.", envelope(ResendVerificationSchema)),
    ...errorResponses(400, 429),
  },
});
