import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { approveRunnerLoginAPI, checkRunnerLoginAPI, claimJobAPI, createRunnerAPI, disconnectRunnerAPI, enrollRunnerAPI, listRunnersAPI, lookupRunnerLoginAPI, removeRunnerAPI, reportJobAPI, runnerMeAPI, startRunnerLoginAPI } from "./api";

const app = new Hono<AppEnv>();

app.route("/", createRunnerAPI);
app.route("/", listRunnersAPI);
app.route("/", enrollRunnerAPI);
app.route("/", startRunnerLoginAPI);
app.route("/", lookupRunnerLoginAPI);
app.route("/", approveRunnerLoginAPI);
app.route("/", checkRunnerLoginAPI);
app.route("/", claimJobAPI);
app.route("/", reportJobAPI);
app.route("/", runnerMeAPI);
app.route("/", disconnectRunnerAPI);
app.route("/", removeRunnerAPI);

export default app;
