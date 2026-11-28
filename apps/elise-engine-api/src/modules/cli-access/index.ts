import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { listCliAccessAPI, revokeCliAccessAPI } from "./api";

const app = new Hono<AppEnv>();

app.route("/", listCliAccessAPI);
app.route("/", revokeCliAccessAPI);

export { cliAccessIdentitySvc } from "./handlers";
export { insertCliAccessEffect } from "./queries";
export { generateCliAccessToken, hashCliAccessToken } from "./utils";
export type { CliAccessIdentity } from "./types";

export default app;
