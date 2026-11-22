import type { AppDeps } from "#/types/variables";

const missing = () => {
  throw new Error("this test has no tenant database");
};

// -----
// withTenant with no database behind it. The job runs on a stand-in
// that throws on first use: a fake dep that ignores its database
// works, and a real query fails loudly instead of touching one.
// -----
export const noTenantDb: AppDeps["withTenant"] = async (_c, _accountId, run) =>
  // SAFETY: every use of the stand-in throws, so no query runs on it.
  run(new Proxy({}, { get: missing }) as never);

export const noOwnerDb: AppDeps["withOwner"] = async (_c, run) =>
  // SAFETY: every use of the stand-in throws, so no query runs on it.
  run(new Proxy({}, { get: missing }) as never);
