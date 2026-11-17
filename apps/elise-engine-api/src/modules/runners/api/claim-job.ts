import { Hono } from "hono";
import { dbConnect } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { claimJobSvc } from "#/modules/runners/handlers";
import { runnerOf } from "#/modules/runners/lib";
import { claimJobDoc } from "#/modules/runners/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

// -----
// Owner role: the token names the Runner, and the Runner
// names its Account.
// -----
app.post("/claim", claimJobDoc, async (c) => {
  const runner = await runnerOf(c);
  const data = await runEffect(claimJobSvc(dbConnect(c.env.DATABASE_URL), runner.runnerId));
  return c.json({ data, error: null });
});

export default app;
