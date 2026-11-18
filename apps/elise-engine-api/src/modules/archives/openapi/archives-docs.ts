import { describeRoute } from "hono-openapi";
import { UploadArchiveListSchema, UploadArchiveRemovedSchema, UploadArchiveSchema } from "@repo/contracts/elise";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, SERVICE_SECURITY, bash, envelope, errorResponses, jsonResponse, routeText } from "#/lib/openapi";

const APP_ID = "5d1f0c9a-2b3e-4f60-9a71-8b92c3d4e5f6";
const ARCHIVE_ID = "7a2e1d0c-3b4f-4a51-8c62-9d03e4f5a6b7";
const AUTH = `  -H "authorization: Bearer $SCAN_API_TOKEN" \\`;
const ACCOUNT = `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`;

export const listArchivesDoc = describeRoute({
  tags: ["repos"],
  security: SERVICE_SECURITY,
  summary: "List the zips of an upload app",
  description: routeText({
    context: "An upload app (a Repo made with `provider: upload`) holds zips of source code. Each Scan of the app reads one of them.",
    steps: ["The Worker finds the upload app in the account, 404 if there is none.", "It lists the app's zips, newest first."],
    example: ["List the zips:", bash(`curl ${EXAMPLE_BASE_URL}/repos/${APP_ID}/archives \\`, AUTH, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The zips.", envelope(UploadArchiveListSchema)), ...errorResponses(400, 401, 403, 404) },
});

export const uploadArchiveDoc = describeRoute({
  tags: ["repos"],
  security: SERVICE_SECURITY,
  summary: "Upload a zip to an upload app",
  description: routeText({
    context: "The body is the zip itself. `label` is the name it is listed under, usually the file name.",
    steps: [
      "The Worker finds the upload app in the account, 404 if there is none.",
      "It refuses a body that is not a zip.",
      "It records the zip (its size and the SHA-256 of its bytes) and stores the bytes under the account.",
    ],
    example: [
      "Upload a zip:",
      bash(`curl "${EXAMPLE_BASE_URL}/repos/${APP_ID}/archives?label=app-1.2.zip" \\`, AUTH, `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}" \\`, '  -H "content-type: application/zip" \\', "  --data-binary @app-1.2.zip"),
    ],
  }),
  responses: { 201: jsonResponse("The stored zip.", envelope(UploadArchiveSchema)), ...errorResponses(400, 401, 403, 404) },
});

export const removeArchiveDoc = describeRoute({
  tags: ["repos"],
  security: SERVICE_SECURITY,
  summary: "Remove a zip from an upload app",
  description: routeText({
    context: "Deletes the zip's bytes and its record. The Scans that read it stay in the History, with a note that the file is gone.",
    steps: ["The Worker deletes the zip's record in the account, 404 if there is none.", "It deletes the bytes."],
    example: ["Remove a zip:", bash(`curl -X DELETE ${EXAMPLE_BASE_URL}/repos/${APP_ID}/archives/${ARCHIVE_ID} \\`, AUTH, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The zip is removed.", envelope(UploadArchiveRemovedSchema)), ...errorResponses(400, 401, 403, 404) },
});
