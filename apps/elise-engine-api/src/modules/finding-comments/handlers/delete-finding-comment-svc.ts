import { Effect } from "effect";
import type { FindingComment } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { Conflict, Forbidden, NotFound, toDbError, type DbError } from "#/lib/effect-query";
import { actorPartyOf } from "#/modules/audit-trail";
import { findFindingCommentEffect, markFindingCommentDeletedEffect } from "#/modules/finding-comments/queries";

export type CommentDeleter = { userId: string; holdsDeletePower: boolean; holdsCreatePower: boolean };

// -----
// A holder of the delete Power deletes anyone's comment. An
// author deletes their own while they still hold the create
// Power. Anyone else is refused, and a comment that is already
// deleted cannot be deleted again.
// -----
export const deleteFindingCommentSvc = (
  db: AppDbType,
  accountId: string,
  commentId: string,
  deleter: CommentDeleter,
): Effect.Effect<FindingComment, NotFound | Forbidden | Conflict | DbError> =>
  Effect.gen(function* () {
    const comment = yield* findFindingCommentEffect(db, accountId, commentId);
    if (!comment) return yield* new NotFound({ message: "Comment not found" });
    const deleterPartyId = yield* Effect.tryPromise({ try: () => actorPartyOf(db, deleter.userId), catch: toDbError });
    const isAuthor = deleterPartyId !== null && comment.authorPartyId === deleterPartyId;
    if (!deleter.holdsDeletePower && !(isAuthor && deleter.holdsCreatePower)) {
      return yield* new Forbidden({ message: "Only the author or an admin can delete this comment" });
    }
    const deleted = yield* markFindingCommentDeletedEffect(db, accountId, commentId, deleterPartyId);
    if (!deleted) return yield* new Conflict({ message: "This comment is already deleted" });
    return deleted;
  });
