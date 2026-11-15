import { describeRoute } from "hono-openapi";
import { FindingCommentSchema } from "@repo/contracts/elise";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, SERVICE_SECURITY, bash, envelope, errorResponses, jsonResponse, routeText } from "#/lib/openapi";

export const createFindingCommentDoc = describeRoute({
  tags: ["findings"],
  summary: "Write a comment on a finding",
  security: SERVICE_SECURITY,
  description: routeText({
    context: "A member writes a comment on a Finding. It is plain text of at most 4,000 characters, kept with the author's name, and stays out of the report and GitHub.",
    steps: [
      "The Worker checks the session and that the login's Role in the account named by `x-account-id` holds the Power `company:findings:comments:create`. The service token names no author, so it is refused (401).",
      "The Worker checks that the account has a finding with this repo and fingerprint. If not, the answer is 404.",
      "The Worker saves the comment with its author and returns it.",
    ],
    example: [
      "Comment on a finding:",
      bash(
        `curl -X POST ${EXAMPLE_BASE_URL}/findings/comments \\`,
        '  -H "authorization: Bearer $SESSION_TOKEN" \\',
        `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}" -H "Content-Type: application/json" \\`,
        `  -d '{"repo":"https://github.com/octocat/Hello-World","fingerprint":"<64 hex characters>","body":"Fixed in the next release."}'`,
      ),
    ],
  }),
  responses: { 201: jsonResponse("The saved comment.", envelope(FindingCommentSchema)), ...errorResponses(400, 401, 403, 404) },
});
