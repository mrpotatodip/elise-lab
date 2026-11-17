import { Effect } from "effect";
import { Hono } from "hono";
import type { TenantDbType } from "#/lib/db-connection";
import { runEffect, toDbError } from "#/lib/effect-query";
import { findConnectedRunnerEffect } from "#/modules/runners/queries";
import type { HoldCredit, ReleaseCredit } from "#/modules/credit";
import { zValidator } from "#/lib/zod-validator";
import type { AppDeps, AppEnv } from "#/types/variables";
import { abandonScanSvc, queueScanSvc, startScanSvc } from "#/modules/scans/handlers";
import { createScanDoc } from "#/modules/scans/openapi";
import { AccountHeaderSchema, CreateScanBodySchema } from "#/modules/scans/schemas";

const app = new Hono<AppEnv>();

const holdOn = (deps: AppDeps, db: TenantDbType, accountId: string): HoldCredit => (scanId, holdUsd) =>
  Effect.tryPromise({ try: () => deps.holdCredit(db, accountId, scanId, holdUsd), catch: toDbError });

const releaseOn = (deps: AppDeps, db: TenantDbType, accountId: string): ReleaseCredit => (scanId) =>
  Effect.tryPromise({ try: () => deps.releaseCredit(db, accountId, scanId), catch: toDbError });

// -----
// The Scan row and its hold commit as the Account in one withTenant
// transaction, so a refused Scan leaves neither. The Workflow starts
// after the commit: it reads both on its own connection.
// -----
app.post("/", createScanDoc, zValidator("header", AccountHeaderSchema), zValidator("json", CreateScanBodySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const body = c.req.valid("json");
  const deps = c.get("deps");
  const queued = await deps.withTenant(c, accountId, async (db) =>
    runEffect(
      queueScanSvc(
        c.env,
        deps.scanRepo(c.env, db),
        accountId,
        body,
        await deps.monthSpend(db, accountId),
        deps.githubAccess(c.env, accountId),
        holdOn(deps, db, accountId),
        (runnerId) => findConnectedRunnerEffect(db, accountId, runnerId),
      ),
    ),
  );
  const abandon = (error: string) =>
    Effect.tryPromise({
      try: () => deps.withTenant(c, accountId, (db) => runEffect(abandonScanSvc(deps.scanRepo(c.env, db), queued, error, releaseOn(deps, db, accountId)))),
      catch: toDbError,
    }).pipe(Effect.ignore);
  const data = await runEffect(startScanSvc(c.env, queued, abandon));
  return c.json({ data, error: null }, 201);
});

export default app;
