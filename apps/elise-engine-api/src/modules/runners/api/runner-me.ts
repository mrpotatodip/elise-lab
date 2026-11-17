import { Hono } from "hono";
import { dbConnect } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { UnauthorizedError } from "#/lib/errors";
import { runnerIdentitySvc } from "#/modules/runners/handlers";
import { runnerMeDoc } from "#/modules/runners/openapi";
import { bearerTokenOf } from "#/modules/runners/utils";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

// -----
// Owner role: the token names the Runner, and the Runner
// names its Account.
// -----
app.get("/me", runnerMeDoc, async (c) => {
  const token = bearerTokenOf(c.req.header("authorization"));
  if (!token) throw new UnauthorizedError();
  const data = await runEffect(runnerIdentitySvc(dbConnect(c.env.DATABASE_URL), token));
  if (!data) throw new UnauthorizedError();
  return c.json({ data, error: null });
});

export default app;
