import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { archivesAPI } from "./api";

export { runUploadRetention } from "./api";

// -----
// The zips of upload apps, under /repos/:repoId/archives, and
// removing an upload app, DELETE /repos/:repoId: an upload app is
// a Repo with provider upload.
// -----
const app = new Hono<AppEnv>();

app.route("/", archivesAPI);

export default app;
