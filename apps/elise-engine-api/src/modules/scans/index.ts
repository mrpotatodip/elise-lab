import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { createScanAPI, detailScanAPI, diffScanAPI, listScansAPI, readScanFileAPI, stopScanAPI } from "./api";

const app = new Hono<AppEnv>();

app.route("/", createScanAPI);
app.route("/", listScansAPI);
app.route("/", detailScanAPI);
app.route("/", diffScanAPI);
app.route("/", readScanFileAPI);
app.route("/", stopScanAPI);

export default app;
