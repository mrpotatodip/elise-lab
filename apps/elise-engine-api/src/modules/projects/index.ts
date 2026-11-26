import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { createProjectAPI, deleteProjectAPI, listProjectsAPI, renameProjectAPI } from "./api";

const app = new Hono<AppEnv>();

app.route("/", listProjectsAPI);
app.route("/", createProjectAPI);
app.route("/", renameProjectAPI);
app.route("/", deleteProjectAPI);

export { moveRepoProjectAPI } from "./api";

export default app;
