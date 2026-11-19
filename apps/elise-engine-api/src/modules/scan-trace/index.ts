import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { readTraceAPI } from "./api";

const app = new Hono<AppEnv>();

app.route("/", readTraceAPI);

export default app;
