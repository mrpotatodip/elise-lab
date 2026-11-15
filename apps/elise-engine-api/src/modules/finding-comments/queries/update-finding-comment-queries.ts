import { and, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import type { FindingComment } from "@repo/contracts/elise";
import { partyPersons, scanFindingComments } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { findingCommentView } from "./finding-comment-view";

// -----
// Saves new text and the edit time. The row must still be
// live: a comment deleted a moment ago gives null.
// -----
export const editFindingCommentEffect = (db: AppDbType, tenantId: string, commentId: string, body: string): Effect.Effect<FindingComment | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db
        .update(scanFindingComments)
        .set({ body, editedAt: new Date() })
        .where(and(eq(scanFindingComments.tenantId, tenantId), eq(scanFindingComments.id, commentId), isNull(scanFindingComments.deletedAt)))
        .returning();
      if (!row) return null;
      const [person] = row.authorPartyId ? await db.select().from(partyPersons).where(eq(partyPersons.partyId, row.authorPartyId)) : [];
      return findingCommentView(row, person);
    },
    catch: toDbError,
  });
