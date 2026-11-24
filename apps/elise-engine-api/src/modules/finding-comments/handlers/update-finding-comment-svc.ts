import { Effect } from "effect";
import type { FindingComment } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { Conflict, Forbidden, NotFound, toDbError, type DbError } from "#/lib/effect-query";
import { actorPartyOf } from "#/modules/audit-trail";
import { editFindingCommentEffect, findFindingCommentEffect } from "#/modules/finding-comments/queries";

// -----
// Only the author edits, and requirePower has already checked
// that the author still holds the create Power. A comment that
// is gone is a 404, a deleted one a 409. userId is the signed-in
// login that requirePower let in.
// -----
export const updateFindingCommentSvc = (
  db: AppDbType,
  accountId: string,
  userId: string,
  commentId: string,
  body: string,
): Effect.Effect<FindingComment, NotFound | Conflict | Forbidden | DbError> =>
  Effect.gen(function* () {
    const comment = yield* findFindingCommentEffect(db, accountId, commentId);
    if (!comment) return yield* new NotFound({ message: "Comment not found" });
    const partyId = yield* Effect.tryPromise({ try: () => actorPartyOf(db, userId), catch: toDbError });
    if (!partyId || comment.authorPartyId !== partyId)
      return yield* new Forbidden({ message: "Only the author can edit a comment" });
    const saved = yield* editFindingCommentEffect(db, accountId, commentId, body);
    if (!saved) return yield* new Conflict({ message: "A deleted comment cannot be edited" });
    return saved;
  });
