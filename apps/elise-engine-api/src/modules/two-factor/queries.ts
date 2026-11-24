import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { accessMasterRoles, authUser, partyMasterRoles, partyRoles, tenants } from "@repo/db-elise";
import type { AppDbType, DbConnectType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { insertAuditEntry } from "#/modules/audit-trail";

export const TWO_FACTOR_ADMIN_ROLE_KEYS = ["tenant_admin", "workspace_admin"];

export type TwoFactorStatus = { enabled: boolean; setupRequired: boolean };

export const twoFactorStatusEffect = (db: DbConnectType, userId: string): Effect.Effect<TwoFactorStatus, DbError> =>
  Effect.gen(function* () {
    const [login] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ partyId: authUser.partyId, enabled: authUser.twoFactorEnabled })
          .from(authUser)
          .where(eq(authUser.id, userId)),
      catch: toDbError,
    });
    if (!login) return { enabled: false, setupRequired: false };
    if (login.enabled) return { enabled: true, setupRequired: false };

    if (yield* partyHoldsAdminRoleEffect(db, login.partyId)) return { enabled: false, setupRequired: true };

    const required = yield* accountRequiresTwoFactorEffect(db, userId);
    return { enabled: false, setupRequired: required };
  });

const partyHoldsAdminRoleEffect = (db: AppDbType, partyId: string): Effect.Effect<boolean, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const admin = await db
        .select({ id: partyRoles.id })
        .from(partyRoles)
        .innerJoin(partyMasterRoles, eq(partyMasterRoles.id, partyRoles.roleId))
        .innerJoin(accessMasterRoles, eq(accessMasterRoles.id, partyMasterRoles.masterRoleId))
        .where(and(eq(partyRoles.partyId, partyId), inArray(accessMasterRoles.key, TWO_FACTOR_ADMIN_ROLE_KEYS)))
        .limit(1);
      return admin.length > 0;
    },
    catch: toDbError,
  });

export const loginIsTwoFactorAdminEffect = (db: AppDbType, userId: string): Effect.Effect<boolean, DbError> =>
  Effect.gen(function* () {
    const [login] = yield* Effect.tryPromise({
      try: () => db.select({ partyId: authUser.partyId }).from(authUser).where(eq(authUser.id, userId)),
      catch: toDbError,
    });
    return login ? yield* partyHoldsAdminRoleEffect(db, login.partyId) : false;
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

export const listAdminEmailsEffect = (db: AppDbType, tenantId: string): Effect.Effect<string[], DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .selectDistinct({ email: authUser.email })
        .from(partyRoles)
        .innerJoin(authUser, eq(authUser.partyId, partyRoles.partyId))
        .innerJoin(partyMasterRoles, eq(partyMasterRoles.id, partyRoles.roleId))
        .innerJoin(accessMasterRoles, eq(accessMasterRoles.id, partyMasterRoles.masterRoleId))
        .where(and(eq(partyRoles.tenantId, tenantId), inArray(accessMasterRoles.key, TWO_FACTOR_ADMIN_ROLE_KEYS))),
    catch: toDbError,
  }).pipe(Effect.map((rows) => rows.map((row) => row.email)));

export const noticeNamesEffect = (
  db: AppDbType,
  tenantId: string,
  actorUserId: string,
): Effect.Effect<{ accountName: string; actorName: string }, DbError> =>
  Effect.gen(function* () {
    const [tenant] = yield* Effect.tryPromise({
      try: () => db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)),
      catch: toDbError,
    });
    const [actor] = yield* Effect.tryPromise({
      try: () => db.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, actorUserId)),
      catch: toDbError,
    });
    return { accountName: tenant?.name ?? "your account", actorName: actor?.name ?? "An admin" };
  });

export const auditTwoFactorChange = async (
  db: AppDbType,
  userId: string,
  action: "two_factor.enabled" | "two_factor.disabled" | "two_factor.locked",
): Promise<void> => {
  const [login] = await db.select({ partyId: authUser.partyId }).from(authUser).where(eq(authUser.id, userId));
  const partyId = login?.partyId;
  if (!partyId) return;
  const accounts = await db
    .selectDistinct({ tenantId: partyRoles.tenantId })
    .from(partyRoles)
    .where(eq(partyRoles.partyId, partyId));
  const tenantIds = accounts.flatMap(({ tenantId }) => (tenantId ? [tenantId] : []));
  await Promise.all(
    tenantIds.map((tenantId) =>
      insertAuditEntry(db, {
        actorPartyId: action === "two_factor.locked" ? null : partyId,
        action,
        subjectId: partyId,
        tenantId,
      }),
    ),
  );
};
