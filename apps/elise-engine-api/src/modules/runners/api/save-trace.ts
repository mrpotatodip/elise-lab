import { Hono } from "hono";
import { RunnerJobParamSchema, SaveTraceBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { runnerOf } from "#/modules/runners/lib";
import { saveTraceSvc } from "#/modules/scan-trace/handlers";
import { saveTraceDoc } from "#/modules/scan-trace/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.post("/jobs/:scanId/trace", saveTraceDoc, zValidator("param", RunnerJobParamSchema), zValidator("json", SaveTraceBodySchema), async (c) => {
  const runner = await runnerOf(c);
  const { scanId } = c.req.valid("param");
  const body = c.req.valid("json");
  const data = await c.get("deps").withTenant(c, runner.accountId, (db) => runEffect(saveTraceSvc(db, runner, scanId, body)));
  return c.json({ data, error: null });
});

export default app;
