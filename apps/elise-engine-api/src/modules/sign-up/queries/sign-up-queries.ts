import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { Data, Effect } from "effect";
import {
  accessMasterPowers,
  accessRolePowers,
  authUser,
  ensureTenantRoles,
  findTenantRole,
  parties,
  partyRoles,
  scans,
  tenants,
  tenantSubscriptions,
} from "@repo/db-elise";
import { TENANT_ADMIN_ROLE_KEY, TenantSchema, type Tenant } from "@repo/contracts/elise";
import type { PoolDbType } from "#/lib/db-connection";
import { Conflict, DbError, toDbError } from "#/lib/effect-query";
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgErrorCode, pgErrorConstraint } from "#/lib/pg-error";
import { SIGN_UP_REFUSED, SIGN_UP_SLUG_CANDIDATE_COUNT, SIGN_UP_SLUG_CONSTRAINT } from "#/modules/sign-up/constants";
import { createPersonLogin } from "#/modules/person-logins";
import { slugCandidates } from "#/modules/sign-up/lib";
import type { NewAccount } from "#/modules/sign-up/types";

// -----
// Stays inside this module: the service catches
// it by tag to pick a new slug and try again.
// -----
export class SlugTaken extends Data.TaggedError("SlugTaken")<{ cause: unknown }> {}

class ReplaceBlocked extends Data.TaggedError("ReplaceBlocked")<{}> {}

export const replaceUnverifiedLoginEffect = (db: PoolDbType, email: string): Effect.Effect<void, Conflict | DbError> =>
  Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        const [login] = await tx
          .select({ id: authUser.id, partyId: authUser.partyId })
          .from(authUser)
          .where(and(eq(authUser.email, email), eq(authUser.emailVerified, false)))
          .for("update");
        if (!login) return;

        const owned = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.partyId, login.partyId));
        const ownedIds = owned.map((row) => row.id);
        if (ownedIds.length === 0) throw new ReplaceBlocked();
        const roles = await tx.select({ tenantId: partyRoles.tenantId }).from(partyRoles).where(eq(partyRoles.partyId, login.partyId));
        if (roles.some((role) => !role.tenantId || !ownedIds.includes(role.tenantId))) throw new ReplaceBlocked();

        const [plan] = await tx.select({ tenantId: tenantSubscriptions.tenantId }).from(tenantSubscriptions).where(inArray(tenantSubscriptions.tenantId, ownedIds)).limit(1);
        const [scan] = await tx.select({ id: scans.id }).from(scans).where(inArray(scans.tenantId, ownedIds)).limit(1);
        const [member] = await tx
          .select({ id: partyRoles.id })
          .from(partyRoles)
          .where(and(inArray(partyRoles.tenantId, ownedIds), ne(partyRoles.partyId, login.partyId)))
          .limit(1);
        if (plan || scan || member) throw new ReplaceBlocked();

        await tx.delete(authUser).where(eq(authUser.id, login.id));
        await tx.delete(tenants).where(inArray(tenants.id, ownedIds));
        await tx.delete(parties).where(eq(parties.id, login.partyId));
      }),
    catch: (cause) =>
      cause instanceof ReplaceBlocked || pgErrorCode(cause) === PG_FOREIGN_KEY_VIOLATION ? new Conflict({ message: SIGN_UP_REFUSED }) : toDbError(cause),
  });

// -----
// The first address from the name that no
// Tenant has. This is a friendly pick; the
// unique index is the real guard.
// -----
export const pickFreeSlugEffect = (db: PoolDbType, accountName: string): Effect.Effect<string, Conflict | DbError> =>
  Effect.gen(function* () {
    const candidates = slugCandidates(accountName, SIGN_UP_SLUG_CANDIDATE_COUNT);
    const rows = yield* Effect.tryPromise({
      try: () => db.select({ slug: tenants.slug }).from(tenants).where(inArray(tenants.slug, candidates)),
      catch: toDbError,
    });
    const taken = new Set(rows.map((row) => row.slug));
    const free = candidates.find((candidate) => !taken.has(candidate));
    if (!free) return yield* new Conflict({ message: SIGN_UP_REFUSED });
    return free;
  });

const classifyInsertFailure = (cause: unknown): SlugTaken | Conflict | DbError => {
  if (pgErrorCode(cause) !== PG_UNIQUE_VIOLATION) return toDbError(cause);
  return pgErrorConstraint(cause) === SIGN_UP_SLUG_CONSTRAINT
    ? new SlugTaken({ cause })
    : new Conflict({ message: SIGN_UP_REFUSED });
};

// -----
// Person, login, credential, Tenant and its
// tenant_admin membership in one transaction: if
// any step fails (a taken email, say), nothing is saved.
// -----
export const insertAccountEffect = (
  db: PoolDbType,
  account: NewAccount,
): Effect.Effect<{ userId: string; tenant: Tenant }, SlugTaken | Conflict | DbError> =>
  Effect.gen(function* () {
    const created = yield* Effect.tryPromise({
      try: () =>
        db.transaction(async (tx) => {
          const { userId, partyId } = await createPersonLogin(tx, {
            firstName: account.firstName,
            lastName: account.lastName,
            email: account.email,
            passwordHash: account.passwordHash,
          });

          const [tenant] = await tx
            .insert(tenants)
            .values({ partyId, name: account.accountName, slug: account.slug, timezone: account.timezone })
            .returning();
          await ensureTenantRoles(tx, tenant.id);
          const tenantAdminRole = await findTenantRole(tx, tenant.id, TENANT_ADMIN_ROLE_KEY);
          if (!tenantAdminRole) throw new Error(`${TENANT_ADMIN_ROLE_KEY} role missing after ensureTenantRoles`);
          await tx.insert(partyRoles).values({
            partyId,
            tenantId: tenant.id,
            roleId: tenantAdminRole.id,
            roleScope: tenantAdminRole.scope,
          });

          const granted = await tx
            .select({ power: accessMasterPowers.power })
            .from(accessRolePowers)
            .innerJoin(accessMasterPowers, eq(accessMasterPowers.id, accessRolePowers.masterPowerId))
            .where(eq(accessRolePowers.masterRoleId, tenantAdminRole.masterRoleId))
            .orderBy(asc(accessMasterPowers.power));

          return { userId, tenant, role: tenantAdminRole, powers: granted.map((row) => row.power) };
        }),
      catch: classifyInsertFailure,
    });
    // -----
    // Our own row, just written: a parse failure
    // is a bug, not something a caller can fix.
    // -----
    const tenant = yield* Effect.try(() =>
      TenantSchema.parse({ ...created.tenant, role: created.role.key, roleLabel: created.role.label, powers: created.powers }),
    ).pipe(Effect.orDie);
    return { userId: created.userId, tenant };
  });
