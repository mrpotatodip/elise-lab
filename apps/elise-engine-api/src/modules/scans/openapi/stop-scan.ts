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
import { ScanStatusSchema } from "#/schemas";

export const stopScanDoc = describeRoute({
  tags: ["scans"],
  summary: "Stop a queued or running scan",
  security: SERVICE_SECURITY,
  description: routeText({
    context:
      "A person ended a Scan on purpose before it finished. The Scan becomes `stopped`, keeps no report and no findings, weighs 0 in the Verdict and frees the account's active-Scan slot.",
    steps: [
      "The Worker checks the token and the account, as for starting a scan.",
      "The Worker sets a `queued` or `running` Scan to `stopped` and its Runner job, if it has one, to `cancelled`, in one transaction. No Runner claims a cancelled job, and a late report for it is refused.",
      "A Scan in our cloud also has its Workflow ended and its sandbox destroyed, the cost metered up to the stop is recorded on it, and its credit is settled at that cost. A queued Scan with no sandbox is charged nothing.",
      "A Scan that already ended answers 409 and changes nothing. A scan of another account answers 404.",
    ],
    example: [
      "Stop a scan:",
      bash(
        `curl -X POST ${EXAMPLE_BASE_URL}/scans/${EXAMPLE_SCAN_ID}/stop \\`,
        '  -H "authorization: Bearer $SCAN_API_TOKEN" \\',
        `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`,
      ),
    ],
  }),
  responses: {
    200: jsonResponse("The stopped scan.", envelope(ScanStatusSchema)),
    ...errorResponses(400, 401, 404, 409),
  },
});
