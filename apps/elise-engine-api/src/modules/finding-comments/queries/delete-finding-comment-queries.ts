import { and, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import type { FindingComment } from "@repo/contracts/elise";
import { partyPersons, scanFindingComments } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { insertAuditEntry } from "#/modules/audit-trail";
import { findingCommentView } from "./finding-comment-view";

// -----
// Empties the body, stamps who deleted it and when, and writes
// the Audit trail row, in the caller's transaction. The update
// only matches a live comment, so a second delete changes
// nothing and the answer is undefined.
// -----
export const markFindingCommentDeletedEffect = (
  db: AppDbType,
  tenantId: string,
  commentId: string,
  deleterPartyId: string | null,
): Effect.Effect<FindingComment | undefined, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db
        .update(scanFindingComments)
        .set({ body: "", deletedAt: new Date(), deletedByPartyId: deleterPartyId })
        .where(
          and(
            eq(scanFindingComments.tenantId, tenantId),
            eq(scanFindingComments.id, commentId),
            isNull(scanFindingComments.deletedAt),
          ),
        )
        .returning();
      if (!row) return undefined;
      // SAFETY: the tenant transaction's insert answers like the pool's one AuditDb names, and access_audit_log has no row-level security.
      await insertAuditEntry(db as never, {
        actorPartyId: deleterPartyId,
        action: "finding.comment.deleted",
        subjectId: row.id,
        tenantId,
      });
      const [person] = row.authorPartyId
        ? await db.select().from(partyPersons).where(eq(partyPersons.partyId, row.authorPartyId))
        : [];
      return findingCommentView(row, person);
    },
    catch: toDbError,
  });
