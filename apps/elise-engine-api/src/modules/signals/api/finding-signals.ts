import { Hono } from "hono";
import { SignalParamSchema, SignalsQuerySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { dismissSignalSvc, listSignalsSvc } from "#/modules/signals/handlers";
import { dismissSignalDoc, listSignalsDoc } from "#/modules/signals/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/", listSignalsDoc, zValidator("header", AccountHeaderSchema), zValidator("query", SignalsQuerySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { repo } = c.req.valid("query");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listSignalsSvc(db, accountId, repo)));
  return c.json({ data, error: null });
});

app.post("/:signalId/dismiss", dismissSignalDoc, zValidator("header", AccountHeaderSchema), zValidator("param", SignalParamSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { signalId } = c.req.valid("param");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(dismissSignalSvc(db, accountId, signalId)));
  return c.json({ data, error: null });
});

export default app;
