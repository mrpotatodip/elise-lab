import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { tenantDataKeys } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";

export const findWrappedKeyEffect = (db: AppDbType, tenantId: string): Effect.Effect<string | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db
        .select({ wrappedKey: tenantDataKeys.wrappedKey })
        .from(tenantDataKeys)
        .where(eq(tenantDataKeys.tenantId, tenantId));
      return row?.wrappedKey ?? null;
    },
    catch: toDbError,
  });

export const insertWrappedKeyEffect = (
  db: AppDbType,
  tenantId: string,
  wrappedKey: string,
): Effect.Effect<string, DbError> =>
  Effect.tryPromise({
    try: async () => {
      await db.insert(tenantDataKeys).values({ tenantId, wrappedKey }).onConflictDoNothing();
      const [row] = await db
        .select({ wrappedKey: tenantDataKeys.wrappedKey })
        .from(tenantDataKeys)
        .where(eq(tenantDataKeys.tenantId, tenantId));
      return row.wrappedKey;
    },
    catch: toDbError,
  });
