import { Effect } from "effect";
import type { CreateFindingCommentBody, FindingComment } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { NotFound, toDbError, type DbError } from "#/lib/effect-query";
import { actorPartyOf } from "#/modules/audit-trail";
import { createFindingCommentEffect } from "#/modules/finding-comments/queries";
import { findingRepoIdEffect } from "#/modules/findings/queries";

// -----
// A comment belongs to a problem the Account's Repo has, so
// a fingerprint it never saw is a 404. userId is the signed-in
// login that requirePower let in.
// -----
export const createFindingCommentSvc = (db: AppDbType, accountId: string, userId: string, body: CreateFindingCommentBody): Effect.Effect<FindingComment, NotFound | DbError> =>
  Effect.gen(function* () {
    const repoId = yield* findingRepoIdEffect(db, accountId, body.repo, body.fingerprint);
    if (!repoId) return yield* new NotFound({ message: "Finding not found" });
    const authorPartyId = yield* Effect.tryPromise({ try: () => actorPartyOf(db, userId), catch: toDbError });
    return yield* createFindingCommentEffect(db, { tenantId: accountId, repoId, fingerprint: body.fingerprint, authorPartyId, body: body.body });
  });
