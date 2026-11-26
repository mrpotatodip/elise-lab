import { and, eq, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { FindingComment } from "@repo/contracts/elise";
import { partyPersons, scanFindingComments } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { findingCommentView } from "./finding-comment-view";

// -----
// Saves new text and the edit time. Text equal to the stored
// text keeps edited_at as it was, so the thread does not say
// "edited" for a save that changed nothing. The row must still
// be live: a comment deleted a moment ago gives null.
// -----
export const editFindingCommentEffect = (
  db: AppDbType,
  tenantId: string,
  commentId: string,
  body: string,
): Effect.Effect<FindingComment | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db
        .update(scanFindingComments)
        .set({
          body,
          editedAt: sql`CASE WHEN ${scanFindingComments.body} = ${body} THEN ${scanFindingComments.editedAt} ELSE now() END`,
        })
        .where(
          and(
            eq(scanFindingComments.tenantId, tenantId),
            eq(scanFindingComments.id, commentId),
            isNull(scanFindingComments.deletedAt),
          ),
        )
        .returning();
      if (!row) return null;
      const [person] = row.authorPartyId
        ? await db.select().from(partyPersons).where(eq(partyPersons.partyId, row.authorPartyId))
        : [];
      return findingCommentView(row, person);
    },
    catch: toDbError,
  });
