import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { archivesAPI } from "./api";

// -----
// The zips of upload apps, under /repos/:repoId/archives:
// an upload app is a Repo with provider upload.
// -----
const app = new Hono<AppEnv>();

app.route("/", archivesAPI);

export default app;
