import { Hono } from "hono";
import { RunnerJobParamSchema } from "@repo/contracts/elise";
import { dbConnect } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { jobStateSvc } from "#/modules/runners/handlers";
import { runnerOf } from "#/modules/runners/lib";
import { jobStateDoc } from "#/modules/runners/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/jobs/:scanId", jobStateDoc, zValidator("param", RunnerJobParamSchema), async (c) => {
  const runner = await runnerOf(c);
  const { scanId } = c.req.valid("param");
  const data = await runEffect(jobStateSvc(dbConnect(c.env.DATABASE_URL), runner.runnerId, scanId));
  return c.json({ data, error: null });
});

export default app;
