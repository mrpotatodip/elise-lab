import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { scanFindingComments, type TFindingComment } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";

// -----
// One comment of the Account, or null. The tenant filter
// stays here as well as in the row-level security.
// -----
export const findFindingCommentEffect = (
  db: AppDbType,
  tenantId: string,
  commentId: string,
): Effect.Effect<TFindingComment | null, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select()
        .from(scanFindingComments)
        .where(and(eq(scanFindingComments.tenantId, tenantId), eq(scanFindingComments.id, commentId)))
        .then(([row]) => row ?? null),
    catch: toDbError,
  });
