import { describeRoute } from "hono-openapi";
import { FindingCommentSchema } from "@repo/contracts/elise";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, SERVICE_SECURITY, bash, envelope, errorResponses, jsonResponse, routeText } from "#/lib/openapi";

export const deleteFindingCommentDoc = describeRoute({
  tags: ["findings"],
  summary: "Delete a comment on a finding",
  security: SERVICE_SECURITY,
  description: routeText({
    context:
      'An author deletes their own comment, or an admin deletes anyone\'s. The body is removed and a "deleted" marker stays in the thread, so the timeline has no silent gap. The deleter goes into the Audit trail as `finding.comment.deleted`.',
    steps: [
      "The Worker checks the session. The service token names no one, so it is refused (401).",
      "The Worker checks the comment is in the account named by `x-account-id`. If not, the answer is 404.",
      "The login must hold the Power `company:findings:comments:delete`, or be the comment's author and hold `company:findings:comments:create`. Otherwise the answer is 403.",
      "A comment that is already deleted is refused (409).",
      "The Worker empties the body, marks the comment deleted and writes the Audit trail row in one transaction, then returns the marker.",
    ],
    example: [
      "Delete a comment:",
      bash(`curl -X DELETE ${EXAMPLE_BASE_URL}/findings/comments/$COMMENT_ID \\`, '  -H "authorization: Bearer $SESSION_TOKEN" \\', `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`),
    ],
  }),
  responses: { 200: jsonResponse("The comment as a deleted marker, with no body.", envelope(FindingCommentSchema)), ...errorResponses(400, 401, 403, 404, 409) },
});
