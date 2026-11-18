import { Hono } from "hono";
import { RunnerLoginLookupQuerySchema } from "@repo/contracts/elise";
import { dbConnect } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { requireSession } from "#/lib/require-session";
import { zValidator } from "#/lib/zod-validator";
import { lookupRunnerLoginSvc } from "#/modules/runners/handlers";
import { lookupRunnerLoginDoc } from "#/modules/runners/openapi";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

// -----
// Owner role: the login has no Account until a member approves
// it, so the user code names it before any Account is chosen.
// -----
app.get("/login/lookup", lookupRunnerLoginDoc, requireSession, zValidator("query", RunnerLoginLookupQuerySchema), async (c) => {
  const { code } = c.req.valid("query");
  const data = await runEffect(lookupRunnerLoginSvc(dbConnect(c.env.DATABASE_URL), code));
  return c.json({ data, error: null });
});

export default app;
