import { describeRoute } from "hono-openapi";
import { CliAccessListSchema, CliAccessRevokedSchema } from "@repo/contracts/elise";
import {
  EXAMPLE_ACCOUNT_ID,
  EXAMPLE_BASE_URL,
  SERVICE_SECURITY,
  bash,
  envelope,
  errorResponses,
  jsonResponse,
  routeText,
} from "#/lib/openapi";

const SESSION = '  -H "authorization: Bearer $SESSION_TOKEN" \\';
const ACCOUNT = `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`;
const CLI_ACCESS_ID = "7c1e4a52-9d3b-4f68-8a21-5b0c6d7e8f90";

export const listCliAccessDoc = describeRoute({
  tags: ["cli-access"],
  security: SERVICE_SECURITY,
  summary: "List CLI access",
  description: routeText({
    context:
      "CLI access is what a person let one Elise CLI do in this account: a scope of `read`, `start` or `admin`, never more than that person's Role allows. It is listed next to the Runners, with who approved it and when. A token is shown once, when the login is collected, and never here.",
    steps: [
      "The Worker checks the session and that the login holds a Role in the account named by `x-account-id`. CLI access itself cannot call this route.",
      "The Worker returns the account's live CLI access, newest first.",
    ],
    example: ["List it:", bash(`curl ${EXAMPLE_BASE_URL}/cli-access \\`, SESSION, ACCOUNT)],
  }),
  responses: {
    200: jsonResponse("The live CLI access.", envelope(CliAccessListSchema)),
    ...errorResponses(400, 401, 403),
  },
});

export const revokeCliAccessDoc = describeRoute({
  tags: ["cli-access"],
  security: SERVICE_SECURITY,
  summary: "Revoke CLI access",
  description: routeText({
    context: "The token stops working on the next call. A revoked CLI access is no longer listed.",
    steps: [
      "The Worker checks the session and that the Role in the account holds `company:runners:delete`, the Power that removes a Runner.",
      "The Worker revokes the CLI access, or answers 404 if the account has no such live one, and writes one Audit trail entry.",
    ],
    example: [
      "Revoke it:",
      bash(`curl -X DELETE ${EXAMPLE_BASE_URL}/cli-access/${CLI_ACCESS_ID} \\`, SESSION, ACCOUNT),
    ],
  }),
  responses: {
    200: jsonResponse("The CLI access is revoked.", envelope(CliAccessRevokedSchema)),
    ...errorResponses(400, 401, 403, 404),
  },
});
