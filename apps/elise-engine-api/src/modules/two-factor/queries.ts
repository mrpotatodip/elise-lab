import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { accessMasterRoles, authUser, partyMasterRoles, partyRoles, tenants } from "@repo/db-elise";
import type { AppDbType, DbConnectType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";

export const TWO_FACTOR_ADMIN_ROLE_KEYS = ["tenant_admin", "workspace_admin"];

export type TwoFactorStatus = { enabled: boolean; setupRequired: boolean };

export const twoFactorStatusEffect = (db: DbConnectType, userId: string): Effect.Effect<TwoFactorStatus, DbError> =>
  Effect.gen(function* () {
    const [login] = yield* Effect.tryPromise({
      try: () => db.select({ partyId: authUser.partyId, enabled: authUser.twoFactorEnabled }).from(authUser).where(eq(authUser.id, userId)),
      catch: toDbError,
    });
    if (!login) return { enabled: false, setupRequired: false };
    if (login.enabled) return { enabled: true, setupRequired: false };

    const admin = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: partyRoles.id })
          .from(partyRoles)
          .innerJoin(partyMasterRoles, eq(partyMasterRoles.id, partyRoles.roleId))
          .innerJoin(accessMasterRoles, eq(accessMasterRoles.id, partyMasterRoles.masterRoleId))
          .where(and(eq(partyRoles.partyId, login.partyId), inArray(accessMasterRoles.key, TWO_FACTOR_ADMIN_ROLE_KEYS)))
          .limit(1),
      catch: toDbError,
    });
    if (admin.length > 0) return { enabled: false, setupRequired: true };

    const required = yield* accountRequiresTwoFactorEffect(db, userId);
    return { enabled: false, setupRequired: required };
  });

export const accountRequiresTwoFactorEffect = (db: AppDbType, userId: string): Effect.Effect<boolean, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .select({ id: partyRoles.id })
        .from(authUser)
        .innerJoin(partyRoles, eq(partyRoles.partyId, authUser.partyId))
        .innerJoin(tenants, eq(tenants.id, partyRoles.tenantId))
        .where(and(eq(authUser.id, userId), eq(tenants.twoFactorRequired, true)))
        .limit(1);
      return rows.length > 0;
    },
    catch: toDbError,
  });
