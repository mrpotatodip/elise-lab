import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import { createFindingCommentAPI, getFindingThreadAPI } from "./api";

const app = new Hono<AppEnv>();

app.route("/", getFindingThreadAPI);
app.route("/", createFindingCommentAPI);

export default app;
