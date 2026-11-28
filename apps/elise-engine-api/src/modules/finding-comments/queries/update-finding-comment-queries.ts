import { and, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import type { FindingComment } from "@repo/contracts/elise";
import { partyPersons, scanFindingComments } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import type { Sealer } from "#/modules/sealed-data";
import { findingCommentView } from "./finding-comment-view";

// -----
// Saves new text, sealed, and the edit time. Text equal to the
// stored text (compared once opened) keeps edited_at as it was,
// so the thread does not say "edited" for a save that changed
// nothing. The row must still be live: a comment deleted a moment
// ago gives null. The answer carries the text opened.
// -----
export const editFindingCommentEffect = (
  db: AppDbType,
  tenantId: string,
  commentId: string,
  body: string,
  sealer: Sealer,
): Effect.Effect<FindingComment | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const live = and(
        eq(scanFindingComments.tenantId, tenantId),
        eq(scanFindingComments.id, commentId),
        isNull(scanFindingComments.deletedAt),
      );
      const [current] = await db.select().from(scanFindingComments).where(live);
      if (!current) return null;
      const unchanged = (await sealer.open.text(current.body)) === body;
      const [row] = await db
        .update(scanFindingComments)
        .set({ body: await sealer.text(body), editedAt: unchanged ? current.editedAt : new Date() })
        .where(live)
        .returning();
      if (!row) return null;
      const [person] = row.authorPartyId
        ? await db.select().from(partyPersons).where(eq(partyPersons.partyId, row.authorPartyId))
        : [];
      return findingCommentView({ ...row, body }, person);
    },
    catch: toDbError,
  });
