import { createTestDb } from "@repo/db-elise/test-db";
import { parties, partyMasterTypes, partyPersons, scanRepoBranches, scanRepos, scans, tenants } from "@repo/db-elise/schema";
import { and, eq, sql } from "drizzle-orm";
import { Data, Effect, Exit } from "effect";
import type { AppDbType, DbConnectType, PoolDbType } from "#/lib/db-connection";

// -----
// A fresh in-memory Postgres with every migration applied.
// The engine's queries are typed for Neon's drivers; pglite
// answers the same calls, so one cast bridges them.
// -----
export async function openTestDb() {
  const { db, close } = await createTestDb(MIGRATIONS_DIR);
  // SAFETY: the queries under test use only select, insert, update, delete and transaction, which pglite supports like Neon's HTTP driver.
  const http: DbConnectType = db as never;
  // SAFETY: the same calls, plus transaction, which pglite and Neon's pool driver both support.
  const pool: PoolDbType = db as never;
  return { http, pool, raw: db, close };
}

export type TestDb = Awaited<ReturnType<typeof openTestDb>>;

// -----
// Thrown out of the transaction to roll it back.
// -----
class RolledBack extends Data.TaggedError("RolledBack") {}

// -----
// Runs a service as one Account the way withTenant does: the
// elise_app role and app.tenant_id, in one transaction. A failed
// effect rolls the transaction back, like a route's error does.
// -----
export const asTenant = <A, E>(test: TestDb, accountId: string, make: (db: AppDbType) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.flatten(
    Effect.promise(async () => {
      let exit: Exit.Exit<A, E> = Exit.die(new RolledBack());
      await test.raw
        .transaction(async (tx) => {
          await tx.execute(sql`set local role elise_app`);
          await tx.execute(sql`select set_config('app.tenant_id', ${accountId}, true)`);
          // SAFETY: the pglite transaction answers the same calls as the pg transaction withTenant passes.
          exit = await Effect.runPromiseExit(make(tx as never));
          if (Exit.isFailure(exit)) throw new RolledBack();
        })
        .catch((cause: unknown) => (cause instanceof RolledBack ? undefined : Promise.reject(cause)));
      return exit;
    }),
  );

export async function seedTenant(test: TestDb, slug = "acme") {
  const [type] = await test.raw.select().from(partyMasterTypes).where(eq(partyMasterTypes.key, "person"));
  const [party] = await test.raw.insert(parties).values({ masterTypeId: type.id }).returning();
  await test.raw.insert(partyPersons).values({ partyId: party.id, firstName: "Ada", lastName: "Rossi" });
  const [tenant] = await test.raw.insert(tenants).values({ partyId: party.id, name: slug, slug, timezone: "UTC" }).returning();
  return { tenantId: tenant.id, partyId: party.id };
}

// -----
// A repo record for a Tenant, so a scan row can point at it.
// -----
export async function seedRepo(test: TestDb, tenantId: string, url = "https://github.com/octocat/Hello-World") {
  const canonical = url.replace(/^https:\/\/github\.com\//, "").replace(/(\.git)?\/?$/, "").toLowerCase();
  const [repo] = await test.raw.insert(scanRepos).values({ tenantId, canonical, url, defaultBranch: "main" }).onConflictDoNothing().returning();
  if (repo) {
    await test.raw.insert(scanRepoBranches).values({ tenantId, repoId: repo.id, name: "main" });
    return repo.id;
  }
  const [existing] = await test.raw.select().from(scanRepos).where(eq(scanRepos.tenantId, tenantId));
  return existing.id;
}

// -----
// The id of a branch of a repo that seedRepo or a test made.
// -----
export async function branchIdOf(test: TestDb, repoId: string, name = "main") {
  const [branch] = await test.raw
    .select({ id: scanRepoBranches.id })
    .from(scanRepoBranches)
    .where(and(eq(scanRepoBranches.repoId, repoId), eq(scanRepoBranches.name, name)));
  return branch.id;
}

// -----
// The values of a succeeded lite scan row. A test that inserts
// scans rows builds them here, so a new required column is
// added in one place.
// -----
export const scanValues = (
  tenantId: string,
  repoId: string,
  id: string,
  createdAt: string,
  overrides: Partial<typeof scans.$inferInsert> = {},
): typeof scans.$inferInsert => ({
  id,
  tenantId,
  repo: "https://github.com/octocat/Hello-World",
  repoId,
  status: "succeeded",
  skill: "lite",
  model: "claude-haiku-5-5",
  effort: "low",
  profile: "quick",
  maxBudgetUsd: "1.00",
  createdAt: new Date(createdAt),
  ...overrides,
});
