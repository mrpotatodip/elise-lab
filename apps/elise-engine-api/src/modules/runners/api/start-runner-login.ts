import { Hono } from "hono";
import { StartRunnerLoginBodySchema } from "@repo/contracts/elise";
import { dbConnect } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { startRunnerLoginSvc } from "#/modules/runners/handlers";
import { requireLoginStartLimit, requireLoginStartTotalLimit } from "#/modules/runners/lib";
import { startRunnerLoginDoc } from "#/modules/runners/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

// -----
// Owner role: a Runner has no session and no Account yet.
// The login row has no Account until a member approves it.
// -----
app.post("/login/start", startRunnerLoginDoc, requireLoginStartLimit, requireLoginStartTotalLimit, zValidator("json", StartRunnerLoginBodySchema), async (c) => {
  const body = c.req.valid("json");
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const data = await runEffect(startRunnerLoginSvc(dbConnect(c.env.DATABASE_URL), body, { ip, dashboardUrl: c.env.DASHBOARD_URL }));
  return c.json({ data, error: null });
});

export default app;
