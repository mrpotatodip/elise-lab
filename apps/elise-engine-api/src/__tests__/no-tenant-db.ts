import type { AppDeps } from "#/types/variables";

// -----
// For a route test that never reaches a tenant-scoped query: a
// call that does fails loudly instead of touching a database.
// -----
export const noTenantDb: AppDeps["withTenant"] = async () => {
  throw new Error("this test has no tenant database");
};

// -----
// For a POST /scans test whose scanRepo, monthSpend and holdCredit
// are fakes that never touch the database they are handed.
// -----
export const fakeTenantDb: AppDeps["withTenant"] = (_c, _accountId, run) =>
  // SAFETY: every dep the route hands this database to is a fake that ignores it.
  run(null as never);
