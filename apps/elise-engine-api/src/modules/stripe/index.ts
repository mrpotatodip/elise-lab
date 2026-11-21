import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { receiveStripeWebhookAPI } from "./api";

const app = new Hono<AppEnv>();

app.route("/", receiveStripeWebhookAPI);

export default app;
