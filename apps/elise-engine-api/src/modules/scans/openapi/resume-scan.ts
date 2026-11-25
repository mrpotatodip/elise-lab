import { describeRoute } from "hono-openapi";
import {
  EXAMPLE_ACCOUNT_ID,
  EXAMPLE_BASE_URL,
  EXAMPLE_SCAN_ID,
  SERVICE_SECURITY,
  bash,
  envelope,
  errorResponses,
  jsonResponse,
  routeText,
} from "#/lib/openapi";
import { ScanQueuedSchema } from "#/modules/scans/schemas";

export const resumeScanDoc = describeRoute({
  tags: ["scans"],
  summary: "Resume a failed or stopped Runner Scan as a new Scan",
  security: SERVICE_SECURITY,
  description: routeText({
    context:
      "A Resumed Scan is a new Scan that carries on from the kept work folder of an earlier Runner Scan that failed or was stopped. The earlier Scan stays as it ended. The request has no body: the new Scan takes the earlier one's repository, ref, profile, scope and Budget cap, and cannot change them.",
    steps: [
      "The Worker checks the token and the account, then reads the Scan to resume. It must be a failed or stopped Scan that ran on a Runner, must not have spent its whole Budget cap, and must not have a Resumed Scan already.",
      "The Worker checks what a new Runner Scan needs: an active Plan, no other active Scan on the repository, and room under the account's live-Scan limit.",
      "The Worker writes the new Scan with a link to the one it resumes and starts it. Its job goes only to the Runner that ran the first attempt, and carries `resume: true` and `resumesScanId`. An older Runner ignores both fields.",
      "A Scan that cannot be resumed answers 409 (state) or 400 (a cloud Scan, a removed Runner or zip) with the reason in `error.message`. A scan of another account answers 404. An account over its limit answers 429.",
    ],
    example: [
      "Resume a scan:",
      bash(
        `curl -X POST ${EXAMPLE_BASE_URL}/scans/${EXAMPLE_SCAN_ID}/resume \\`,
        '  -H "authorization: Bearer $SCAN_API_TOKEN" \\',
        `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`,
      ),
    ],
  }),
  responses: {
    201: jsonResponse("The queued Resumed Scan.", envelope(ScanQueuedSchema)),
    ...errorResponses(400, 401, 404, 409, 429),
  },
});
