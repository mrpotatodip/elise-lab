import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { stripeWebhookAPI } from "./api";

const app = new Hono<AppEnv>();

app.route("/", stripeWebhookAPI);

export default app;
