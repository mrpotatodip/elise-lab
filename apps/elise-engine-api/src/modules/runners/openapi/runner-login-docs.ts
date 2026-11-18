import { describeRoute } from "hono-openapi";
import { ApprovedRunnerLoginSchema, PendingRunnerLoginSchema, RunnerLoginCheckSchema, StartedRunnerLoginSchema } from "@repo/contracts/elise";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, SERVICE_SECURITY, bash, envelope, errorResponses, json, jsonResponse, routeText } from "#/lib/openapi";

const RUNNER_ID = "5b3f0d7e-61a4-4c2f-9d58-2f7a1c9e4b10";

export const startRunnerLoginDoc = describeRoute({
  tags: ["runners"],
  summary: "Start a Runner login from the terminal",
  description: routeText({
    context:
      "A Runner on a computer with no window asks to be added. The answer holds a short user code and a link to the dashboard's device page that carries it, for a member to open, and a device code that only the Runner keeps. No session is needed.",
    steps: [
      "The Worker reads the Runner's suggested name, OS, CPU and version, and the IP of the request.",
      "The Worker makes the two codes and saves only their hashes, with an expiry 10 minutes away.",
      "The Worker returns both codes once. The Runner then checks with the device code.",
    ],
    example: [
      "Start a login:",
      bash(`curl -X POST ${EXAMPLE_BASE_URL}/runners/login/start \\`, '  -H "Content-Type: application/json" \\', `  -d '{"name":"build-box","os":"linux 6.8","cpu":"x64","version":"0.1.0"}'`),
      json(
        `{ "data": { "userCode": "K7QM-4TXD", "verificationUrl": "https://app.eliselab.com/device?code=K7QM-4TXD", "deviceCode": "Zm9v...", "expiresAt": "2026-11-11T09:10:00.000Z" }, "error": null }`,
      ),
    ],
  }),
  responses: { 200: jsonResponse("The codes and the link.", envelope(StartedRunnerLoginSchema)), ...errorResponses(400) },
});

export const lookupRunnerLoginDoc = describeRoute({
  tags: ["runners"],
  security: SERVICE_SECURITY,
  summary: "Read a pending Runner login by its user code",
  description: routeText({
    context:
      "The dashboard's device page shows what the terminal asked for before a member approves it: the suggested name, the OS and CPU and the IP that started the login. Any signed-in login may ask, because approving still needs the Power.",
    steps: [
      "The Worker checks the session.",
      "The Worker finds a login with this user code that is pending and unexpired. The answer never holds a hash or the device code.",
      "A code that is unknown, expired, approved or collected gets the same 403.",
    ],
    example: [
      "Look up a login:",
      bash(`curl "${EXAMPLE_BASE_URL}/runners/login/lookup?code=K7QM-4TXD" \\`, '  -H "authorization: Bearer $SESSION_TOKEN"'),
      json(`{ "data": { "suggestedName": "build-box", "os": "linux 6.8", "cpu": "x64", "version": "0.1.0", "requestIp": "203.0.113.7", "expiresAt": "2026-11-11T09:10:00.000Z" }, "error": null }`),
    ],
  }),
  responses: { 200: jsonResponse("The pending login.", envelope(PendingRunnerLoginSchema)), ...errorResponses(400, 401, 403) },
});

export const approveRunnerLoginDoc = describeRoute({
  tags: ["runners"],
  security: SERVICE_SECURITY,
  summary: "Approve a Runner login",
  description: routeText({
    context: "A signed-in member opens the link, picks an Account where they may add Runners, and names the Runner. The Runner then collects its token.",
    steps: [
      "The Worker checks the session and that the Role in the account named by `x-account-id` holds `company:runners:create`.",
      "In the Account's transaction the Worker finds a login that is pending and unexpired and marks it approved, with the approver and the approver's IP.",
      "The Worker adds the Runner to the Account with no token yet. A code that matches no live login gets a 403 and nothing is kept.",
    ],
    example: [
      "Approve:",
      bash(`curl -X POST ${EXAMPLE_BASE_URL}/runners/login/approve \\`, '  -H "authorization: Bearer $SESSION_TOKEN" \\', `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}" \\`, '  -H "Content-Type: application/json" \\', `  -d '{"userCode":"K7QM-4TXD","name":"Build box"}'`),
      json(`{ "data": { "approved": true, "runnerId": "${RUNNER_ID}" }, "error": null }`),
    ],
  }),
  responses: { 200: jsonResponse("The login is approved.", envelope(ApprovedRunnerLoginSchema)), ...errorResponses(400, 401, 403) },
});

export const checkRunnerLoginDoc = describeRoute({
  tags: ["runners"],
  summary: "Check a Runner login",
  description: routeText({
    context: "The Runner asks with its device code whether a member has approved it. No session is needed, because the device code is the proof.",
    steps: [
      "While the login is pending the Worker answers `pending`: keep waiting.",
      "The first check after approval makes the token, saves its hash on the Runner, marks the login collected and returns the token, the Runner name and the Account name once.",
      "A device code that is unknown, expired or already collected gets the same 403.",
    ],
    example: [
      "Check:",
      bash(`curl -X POST ${EXAMPLE_BASE_URL}/runners/login/check \\`, '  -H "Content-Type: application/json" \\', `  -d '{"deviceCode":"Zm9v..."}'`),
      json(`{ "data": { "status": "approved", "runnerId": "${RUNNER_ID}", "name": "Build box", "accountId": "${EXAMPLE_ACCOUNT_ID}", "accountName": "Acme", "token": "elr_..." }, "error": null }`),
    ],
  }),
  responses: { 200: jsonResponse("Pending, or the Runner's identity and its token.", envelope(RunnerLoginCheckSchema)), ...errorResponses(400, 403) },
});
