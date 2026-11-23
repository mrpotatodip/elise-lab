import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { createAccountAPI, resendVerificationAPI } from "./api";

const app = new Hono<AppEnv>();

app.route("/", createAccountAPI);
app.route("/", resendVerificationAPI);

export default app;
