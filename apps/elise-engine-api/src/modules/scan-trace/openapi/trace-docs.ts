import { describeRoute } from "hono-openapi";
import { TraceSavedSchema, TraceSchema } from "@repo/contracts/elise";
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

export const readTraceDoc = describeRoute({
  tags: ["scans"],
  summary: "Read a Scan's Trace",
  security: SERVICE_SECURITY,
  description: routeText({
    context:
      "While a Scan runs, the dashboard shows what kind of work the agent is doing. This route returns the Scan's Trace entries: a label, a Phase, a time span and a count each, never anything the agent wrote.",
    steps: [
      "The Worker checks the token and the account.",
      "The Worker reads the entries of that Scan written after `after` (every entry without it), ordered by start time. Another account's Scan gets 404.",
      "The answer carries the cursor to send as `after` next time. An entry that grew comes back again with the same id.",
    ],
    example: [
      "Read the whole Trace:",
      bash(
        `curl ${EXAMPLE_BASE_URL}/scans/${EXAMPLE_SCAN_ID}/trace \\`,
        '  -H "authorization: Bearer $SCAN_API_TOKEN" \\',
        `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`,
      ),
    ],
  }),
  responses: {
    200: jsonResponse("The entries and the next cursor.", envelope(TraceSchema)),
    ...errorResponses(400, 401, 404),
  },
});

export const saveTraceDoc = describeRoute({
  tags: ["runners"],
  security: SERVICE_SECURITY,
  summary: "Send Trace entries for a Scan the Runner runs",
  description: routeText({
    context:
      "While its agent works, the Runner sends the new and grown Trace entries every few seconds. Capture is best effort: the Runner drops a batch that fails, and the Scan goes on.",
    steps: [
      "The Worker reads the bearer token and finds the Runner.",
      "The Worker checks the Scan's job is this Runner's. Any other Scan is 404.",
      "The Worker writes each entry, replacing one with the same id. A new entry past 5,000 per Scan is dropped and counted in `dropped`.",
    ],
    example: [
      "Send one entry:",
      bash(
        `curl -X POST ${EXAMPLE_BASE_URL}/runners/jobs/$SCAN_ID/trace \\`,
        '  -H "authorization: Bearer $RUNNER_TOKEN" \\',
        '  -H "Content-Type: application/json" \\',
        `  -d '{"entries":[{"id":"0190f1a2-b3c4-7d5e-8f60-000000000001","label":"reading_files","phase":"recon","startedAt":"2026-11-19T09:00:00Z","endedAt":"2026-11-19T09:00:04Z","count":3}],"candidateFindings":0}'`,
      ),
    ],
  }),
  responses: {
    200: jsonResponse("How many entries were kept.", envelope(TraceSavedSchema)),
    ...errorResponses(400, 401, 404),
  },
});
