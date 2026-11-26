import { Hono } from "hono";
import { CheckAcceptedRiskBodySchema, SignalParamSchema, SignalsQuerySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { assertPower } from "#/lib/require-power";
import { zValidator } from "#/lib/zod-validator";
import {
  askWeakReasonSvc,
  dismissSignalSvc,
  listSignalsSvc,
  readReasonCheckSvc,
  recordWeakReasonSvc,
} from "#/modules/signals/handlers";
import { checkAcceptedRiskDoc, dismissSignalDoc, listSignalsDoc } from "#/modules/signals/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get(
  "/",
  listSignalsDoc,
  zValidator("header", AccountHeaderSchema),
  zValidator("query", SignalsQuerySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { repo } = c.req.valid("query");
    const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listSignalsSvc(db, accountId, repo)));
    return c.json({ data, error: null });
  },
);

app.post(
  "/weak-reason",
  checkAcceptedRiskDoc,
  zValidator("header", AccountHeaderSchema),
  zValidator("json", CheckAcceptedRiskBodySchema),
  async (c) => {
    await assertPower(c, "company:findings:accepted_risk:update");
    const { "x-account-id": accountId } = c.req.valid("header");
    const body = c.req.valid("json");
    const deps = c.get("deps");
    const input = await deps.withTenant(c, accountId, (db) => runEffect(readReasonCheckSvc(db, accountId, body)));
    const answer = await runEffect(askWeakReasonSvc(input.enabled ? deps.typesafe(c.env) : null, input, body.note));
    const finding = input.finding;
    const signal =
      answer && finding
        ? await deps.withTenant(c, accountId, (db) =>
            runEffect(recordWeakReasonSvc(db, accountId, finding.repoId, body.fingerprint, answer)),
          )
        : null;
    return c.json({ data: { signal }, error: null });
  },
);

app.post(
  "/:signalId/dismiss",
  dismissSignalDoc,
  zValidator("header", AccountHeaderSchema),
  zValidator("param", SignalParamSchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { signalId } = c.req.valid("param");
    const data = await c
      .get("deps")
      .withTenant(c, accountId, (db) => runEffect(dismissSignalSvc(db, accountId, signalId)));
    return c.json({ data, error: null });
  },
);

export default app;
