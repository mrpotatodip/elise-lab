import { Effect } from "effect";
import { buildApp } from "#/index";
import { realAppDeps } from "#/lib/app-deps";
import { tenantScanRepo } from "#/modules/scan-ledger";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { asTenant, type TestDb } from "#/__tests__/test-db";
import { testDeps } from "#/__tests__/test-deps";
import type { AppDeps } from "#/types/variables";

// -----
// POST /scans on the real queries of the withTenant transaction.
// The global count of live Scans runs on the owner role in the
// Worker; here no other Account has one.
// -----
const tenantScanDeps: Partial<AppDeps> = {
  scanRepo: (_env, db) => tenantScanRepo(db, () => Effect.succeed({ lite: 0, full: 0 })),
  monthSpend: realAppDeps.monthSpend,
  holdCredit: realAppDeps.holdCredit,
  releaseCredit: realAppDeps.releaseCredit,
};

// -----
// The route's real wrapper runs the job as the elise_app role with
// app.tenant_id set, inside one transaction. This one does the same
// on pglite, so a route that forgets its tenant filter is still held
// to the account the caller named. openDb is read per call because a
// test opens its database in beforeAll, after the app is built.
// -----
export const tenantRouteApp = (openDb: () => TestDb, overrides: Partial<AppDeps> = {}) =>
  buildApp(
    testDeps({
      ...tenantScanDeps,
      ...overrides,
      withTenant: (_c, accountId, run) => asTenant(openDb(), accountId, run),
    }),
  ).app;

export type TenantRouteApp = ReturnType<typeof tenantRouteApp>;

// -----
// Calls a route as one Account: the shared token plus the
// x-account-id the dashboard server would vouch for. Pass another
// Account's IDs in the path or query to try to cross over.
// -----
export const callAs = (app: TenantRouteApp, accountId: string, path: string, init: { method?: string; body?: unknown } = {}) => {
  const { env } = fakeBindings();
  const headers = new Headers({ authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": accountId, "content-type": "application/json" });
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return app.fetch(new Request(`http://localhost${path}`, { method: init.method, headers, body }), env, testExecutionContext);
};
