import { describeRoute } from "hono-openapi";
import { FindingCommentSchema } from "@repo/contracts/elise";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, SERVICE_SECURITY, bash, envelope, errorResponses, jsonResponse, routeText } from "#/lib/openapi";

export const updateFindingCommentDoc = describeRoute({
  tags: ["findings"],
  summary: "Edit your own comment on a finding",
  security: SERVICE_SECURITY,
  description: routeText({
    context: "The author of a comment changes its text. The comment keeps its place in the thread and shows an edited time. The text follows the same limit as a new comment: at most 4,000 characters.",
    steps: [
      "The Worker checks the session and that the login's Role in the account named by `x-account-id` holds the Power `company:findings:comments:create`. The service token names no author, so it is refused (401).",
      "The Worker looks for the comment in the account. If there is none, the answer is 404.",
      "The Worker checks that the login is the comment's author. Anyone else is refused (403). A deleted comment cannot be edited (409).",
      "The Worker saves the new text, sets the edited time and returns the comment.",
    ],
    example: [
      "Edit a comment:",
      bash(
        `curl -X PATCH ${EXAMPLE_BASE_URL}/findings/comments/<comment id> \\`,
        '  -H "authorization: Bearer $SESSION_TOKEN" \\',
        `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}" -H "Content-Type: application/json" \\`,
        `  -d '{"body":"Fixed in 1.4.2."}'`,
      ),
    ],
  }),
  responses: { 200: jsonResponse("The comment with its new text.", envelope(FindingCommentSchema)), ...errorResponses(400, 401, 403, 404, 409) },
});
