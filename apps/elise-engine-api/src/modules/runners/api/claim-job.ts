import { Hono } from "hono";
import { RunnerClaimBodySchema } from "@repo/contracts/elise";
import { dbConnect } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { r2TextStore } from "#/modules/previous-map";
import { claimJobSvc } from "#/modules/runners/handlers";
import { runnerOf } from "#/modules/runners/lib";
import { claimJobDoc } from "#/modules/runners/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

// -----
// Owner role: the token names the Runner, and the Runner
// names its Account. An older Runner sends no body: the
// validator then reads it as no sources.
// -----
app.post("/claim", claimJobDoc, zValidator("json", RunnerClaimBodySchema), async (c) => {
  const runner = await runnerOf(c);
  const { sources } = c.req.valid("json");
  const data = await runEffect(
    claimJobSvc(dbConnect(c.env.DATABASE_URL), runner.runnerId, sources, r2TextStore(c.env.REPORTS)),
  );
  return c.json({ data, error: null });
});

export default app;
