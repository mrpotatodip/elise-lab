import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { createFindingCommentAPI, getFindingThreadAPI, updateFindingCommentAPI } from "./api";

const app = new Hono<AppEnv>();

app.route("/", getFindingThreadAPI);
app.route("/", createFindingCommentAPI);
app.route("/", updateFindingCommentAPI);

export default app;
