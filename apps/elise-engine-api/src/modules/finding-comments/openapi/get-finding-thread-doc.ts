import { describeRoute } from "hono-openapi";
import { FindingThreadSchema } from "@repo/contracts/elise";
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

export const getFindingThreadDoc = describeRoute({
  tags: ["findings"],
  summary: "Read the discussion of a finding",
  security: SERVICE_SECURITY,
  description: routeText({
    context:
      "A Finding keeps a discussion thread. It belongs to the repo and the fingerprint, so a rescan that finds the same problem shows the same thread.",
    steps: [
      "The Worker checks the token or session and the account. A login needs the Dashboard Power, so a Watcher is refused (403).",
      "The Worker reads the thread of this repo and fingerprint on the account's own rows.",
      "The Worker returns the latest 200 events, oldest first. A repo or fingerprint the account does not have gives an empty thread.",
    ],
    example: [
      "Read a thread:",
      bash(
        `curl "${EXAMPLE_BASE_URL}/findings/comments?repo=https://github.com/octocat/Hello-World&fingerprint=<64 hex characters>" \\`,
        '  -H "authorization: Bearer $SESSION_TOKEN" \\',
        `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`,
      ),
    ],
  }),
  responses: {
    200: jsonResponse("The thread, oldest event first.", envelope(FindingThreadSchema)),
    ...errorResponses(400, 401, 403),
  },
});
