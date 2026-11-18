import { Hono } from "hono";
import { CheckRunnerLoginBodySchema } from "@repo/contracts/elise";
import { dbConnect } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { checkRunnerLoginSvc } from "#/modules/runners/handlers";
import { checkRunnerLoginDoc } from "#/modules/runners/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

// -----
// Owner role: the device code names the login, and the
// approved login names the Runner and its Account.
// -----
app.post("/login/check", checkRunnerLoginDoc, zValidator("json", CheckRunnerLoginBodySchema), async (c) => {
  const body = c.req.valid("json");
  const data = await runEffect(checkRunnerLoginSvc(dbConnect(c.env.DATABASE_URL), body));
  return c.json({ data, error: null });
});

export default app;
