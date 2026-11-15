import { sql } from "drizzle-orm";
import { buildApp } from "#/index";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import type { TestDb } from "#/__tests__/test-db";
import { testDeps } from "#/__tests__/test-deps";

// -----
// The route's real wrapper runs the job as the elise_app role with
// app.tenant_id set, inside one transaction. This one does the same
// on pglite, so a route that forgets its tenant filter is still held
// to the account the caller named. openDb is read per call because a
// test opens its database in beforeAll, after the app is built.
// -----
export const tenantRouteApp = (openDb: () => TestDb) =>
  buildApp(
    testDeps({
      withTenant: (_c, accountId, run) =>
        openDb().raw.transaction(async (tx) => {
          await tx.execute(sql`set local role elise_app`);
          await tx.execute(sql`select set_config('app.tenant_id', ${accountId}, true)`);
          // SAFETY: the pglite transaction answers the same calls as the pg transaction the route's real wrapper passes.
          return run(tx as never);
        }),
    }),
  ).app;

export type TenantRouteApp = ReturnType<typeof tenantRouteApp>;

// -----
// Calls a route as one Account: the shared token plus the
// x-account-id the dashboard server would vouch for. Pass another
// Account's IDs in the path or query to try to cross over.
// -----
export const callAs = (app: TenantRouteApp, accountId: string, path: string) => {
  const { env } = fakeBindings();
  return app.fetch(new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": accountId } }), env, testExecutionContext);
};
