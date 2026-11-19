import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { readTraceAPI } from "./api";

// -----
// GET /scans/:scanId/trace. The Runner's write sits with the
// other Runner routes, under /runners/jobs/:scanId/trace.
// -----
const app = new Hono<AppEnv>();

app.route("/", readTraceAPI);

export default app;
