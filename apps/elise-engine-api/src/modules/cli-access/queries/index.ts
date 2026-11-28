import { and, desc, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { authUser, partyPersons, tenantCliAccess } from "@repo/db-elise";
import type { CliAccess } from "@repo/contracts/elise";
import type { AppDbType, DbConnectType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { actorPartyOf, insertAuditEntry } from "#/modules/audit-trail";
import type { CliAccessIdentity, NewCliAccess } from "#/modules/cli-access/types";

export const insertCliAccessEffect = (
  db: Pick<AppDbType, "insert">,
  access: NewCliAccess,
): Effect.Effect<{ id: string }, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db.insert(tenantCliAccess).values(access).returning({ id: tenantCliAccess.id });
      if (!row) throw new Error("CLI access not saved");
      return row;
    },
    catch: toDbError,
  });

export const findCliAccessByTokenEffect = (
  db: DbConnectType,
  tokenHash: string,
  now: Date,
): Effect.Effect<CliAccessIdentity | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db
        .update(tenantCliAccess)
        .set({ lastUsedAt: now })
        .where(and(eq(tenantCliAccess.tokenHash, tokenHash), isNull(tenantCliAccess.revokedAt)))
        .returning({
          id: tenantCliAccess.id,
          personId: tenantCliAccess.personId,
          accountId: tenantCliAccess.tenantId,
          scope: tenantCliAccess.scope,
        });
      if (!row) return null;
      const [login] = await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.partyId, row.personId));
      return login ? { id: row.id, userId: login.id, accountId: row.accountId, scope: row.scope } : null;
    },
    catch: toDbError,
  });

export const listCliAccessEffect = (db: AppDbType, tenantId: string): Effect.Effect<CliAccess[], DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({
          access: tenantCliAccess,
          firstName: partyPersons.firstName,
          lastName: partyPersons.lastName,
        })
        .from(tenantCliAccess)
        .leftJoin(partyPersons, eq(partyPersons.partyId, tenantCliAccess.personId))
        .where(and(eq(tenantCliAccess.tenantId, tenantId), isNull(tenantCliAccess.revokedAt)))
        .orderBy(desc(tenantCliAccess.createdAt)),
    catch: toDbError,
  }).pipe(
    Effect.map((rows) =>
      rows.map(({ access, firstName, lastName }): CliAccess => ({
        id: access.id,
        name: access.name,
        scope: access.scope,
        approvedByName: firstName === null ? null : `${firstName} ${lastName}`.trim(),
        approvedAt: access.approvedAt.toISOString(),
        lastUsedAt: access.lastUsedAt?.toISOString() ?? null,
      })),
    ),
  );

export const revokeCliAccessEffect = (
  db: AppDbType,
  input: { tenantId: string; cliAccessId: string; actorUserId: string; now: Date },
): Effect.Effect<boolean, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db
        .update(tenantCliAccess)
        .set({ revokedAt: input.now })
        .where(
          and(
            eq(tenantCliAccess.id, input.cliAccessId),
            eq(tenantCliAccess.tenantId, input.tenantId),
            isNull(tenantCliAccess.revokedAt),
          ),
        )
        .returning({ id: tenantCliAccess.id, name: tenantCliAccess.name, scope: tenantCliAccess.scope });
      if (!row) return false;
      await insertAuditEntry(db, {
        actorPartyId: await actorPartyOf(db, input.actorUserId),
        action: "cli_access.revoke",
        subjectId: row.id,
        tenantId: input.tenantId,
        before: { name: row.name, cliScope: row.scope },
      });
      return true;
    },
    catch: toDbError,
  });
