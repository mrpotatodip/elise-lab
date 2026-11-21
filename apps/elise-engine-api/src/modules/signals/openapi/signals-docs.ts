import { describeRoute } from "hono-openapi";
import { SignalSchema, SignalsSettingsSchema } from "@repo/contracts/elise";
import { z } from "zod";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, SERVICE_SECURITY, bash, envelope, errorResponses, jsonResponse, routeText } from "#/lib/openapi";

const SESSION = '  -H "authorization: Bearer $SESSION_TOKEN" \\';
const ACCOUNT = `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`;

export const getSignalsSettingsDoc = describeRoute({
  tags: ["usage"],
  summary: "Whether Signals are on for the account",
  security: SERVICE_SECURITY,
  description: routeText({
    context: "Signals are hints from TypeSafe's Jev model (ADR 0011). They are on for every account until an admin turns them off.",
    steps: ["The Worker checks the token or session and the account. A login needs the Dashboard Power.", "The Worker returns `enabled`."],
    example: ["Read the switch:", bash(`curl ${EXAMPLE_BASE_URL}/usage/signals \\`, SESSION, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The switch.", envelope(SignalsSettingsSchema)), ...errorResponses(400, 401, 403) },
});

export const setSignalsSettingsDoc = describeRoute({
  tags: ["usage"],
  summary: "Turn Signals on or off for the account",
  security: SERVICE_SECURITY,
  description: routeText({
    context: "Off stops new requests to TypeSafe and hides stored Signals without deleting them. Finding titles, descriptions, evidence text and decision notes are what Signals send, never source code.",
    steps: [
      "The Worker checks the session and that the login's Role in the account holds `company:signals:update`.",
      "The Worker saves the switch and writes an audit row with the old and new value, in one transaction.",
      "The Worker returns the switch.",
    ],
    example: ["Turn Signals off:", bash(`curl -X PUT ${EXAMPLE_BASE_URL}/usage/signals \\`, SESSION, `${ACCOUNT} \\`, '  -H "Content-Type: application/json" \\', `  -d '{"enabled":false}'`)],
  }),
  responses: { 200: jsonResponse("The switch.", envelope(SignalsSettingsSchema)), ...errorResponses(400, 401, 403) },
});

export const listSignalsDoc = describeRoute({
  tags: ["findings"],
  summary: "Read the Signals of a repo",
  security: SERVICE_SECURITY,
  description: routeText({
    context: "A Signal is a hint about a Finding. It never changes a Finding, a decision or the Verdict.",
    steps: [
      "The Worker checks the token or session and the account. A login needs the Dashboard Power, so a Watcher is refused (403).",
      "The Worker returns the repo's Signals nobody dismissed, oldest first. With Signals off it returns an empty list.",
    ],
    example: ["Read them:", bash(`curl "${EXAMPLE_BASE_URL}/findings/signals?repo=https://github.com/octocat/Hello-World" \\`, SESSION, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The Signals.", envelope(z.array(SignalSchema))), ...errorResponses(400, 401, 403) },
});

export const dismissSignalDoc = describeRoute({
  tags: ["findings"],
  summary: "Dismiss a Signal",
  security: SERVICE_SECURITY,
  description: routeText({
    context: "A dismissed Signal is hidden for the whole account. The row is kept.",
    steps: ["The Worker checks the token or session and the account.", "The Worker answers 404 if the account has no live Signal with this ID.", "The Worker hides the Signal."],
    example: ["Dismiss one:", bash(`curl -X POST ${EXAMPLE_BASE_URL}/findings/signals/<signalId>/dismiss \\`, SESSION, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The Signal is hidden.", envelope(z.object({ dismissed: z.literal(true) }))), ...errorResponses(400, 401, 403, 404) },
});
