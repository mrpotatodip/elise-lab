import { Hono } from "hono";
import { RunnerJobParamSchema } from "@repo/contracts/elise";
import { dbConnect } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { jobArchiveSvc } from "#/modules/runners/handlers";
import { runnerOf } from "#/modules/runners/lib";
import { jobArchiveDoc } from "#/modules/runners/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

// -----
// Owner role: the token names the Runner, and only the Runner
// that claimed the job gets its zip. The bytes stream from R2.
// -----
app.get("/jobs/:scanId/archive", jobArchiveDoc, zValidator("param", RunnerJobParamSchema), async (c) => {
  const runner = await runnerOf(c);
  const { scanId } = c.req.valid("param");
  const { body } = await runEffect(
    jobArchiveSvc(dbConnect(c.env.DATABASE_URL), c.env.REPORTS, runner.runnerId, scanId, c.env.DATA_MASTER_KEY),
  );
  return c.body(body, 200, { "content-type": "application/zip" });
});

export default app;
