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
      "It refuses a body over 50 MB (413), and a body that is not a zip.",
      "From the zip's central directory, it refuses more than 20,000 files, a path more than 20 levels deep, or more than 250 MB unpacked (400).",
      "It refuses a 21st zip in the app, or a zip that takes the account past 500 MB of stored zips (409).",
      "It records the zip (its size and the SHA-256 of its bytes) and stores the bytes under the account. A zip no Scan has read is deleted 30 days after upload.",
    ],
    example: [
      "Upload a zip:",
      bash(`curl "${EXAMPLE_BASE_URL}/repos/${APP_ID}/archives?label=app-1.2.zip" \\`, AUTH, `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}" \\`, '  -H "content-type: application/zip" \\', "  --data-binary @app-1.2.zip"),
    ],
  }),
  responses: { 201: jsonResponse("The stored zip.", envelope(UploadArchiveSchema)), ...errorResponses(400, 401, 403, 404, 409, 413) },
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

export const removeUploadAppDoc = describeRoute({
  tags: ["repos"],
  security: SERVICE_SECURITY,
  summary: "Remove a repo",
  description: routeText({
    context:
      "Soft-deletes a repo of any provider: it leaves the repo list, but its Scans and findings stay in the History. An upload app also loses every zip, bytes and records, and its Scans keep a note that their file is gone. Adding the repo again, or scanning it, brings it back.",
    steps: [
      "The Worker finds the repo in the account, 404 if there is none or it is already removed.",
      "It deletes the zips' records (an upload app only) and marks the repo removed.",
      "It deletes every object stored under the repo (an upload app only).",
    ],
    example: ["Remove a repo:", bash(`curl -X DELETE ${EXAMPLE_BASE_URL}/repos/${APP_ID} \\`, AUTH, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The repo is removed.", envelope(UploadArchiveRemovedSchema)), ...errorResponses(400, 401, 403, 404) },
});
