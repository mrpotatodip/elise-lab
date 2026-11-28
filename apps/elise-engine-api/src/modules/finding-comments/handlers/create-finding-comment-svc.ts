import { Effect } from "effect";
import type { CreateFindingCommentBody, FindingComment } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { Forbidden, NotFound, toDbError, type DbError, type ExternalError } from "#/lib/effect-query";
import { sealerEffect } from "#/modules/sealed-data";
import { actorPartyOf } from "#/modules/audit-trail";
import { createFindingCommentEffect } from "#/modules/finding-comments/queries";
import { findingRepoIdEffect } from "#/modules/findings/queries";

// -----
// A comment belongs to a problem the Account's Repo has, so
// a fingerprint it never saw is a 404. userId is the signed-in
// login that requirePower let in; a login with no Party has no
// author to show, so it is a 403.
// -----
export const createFindingCommentSvc = (
  db: AppDbType,
  accountId: string,
  userId: string,
  body: CreateFindingCommentBody,
  masterKey: string | undefined,
): Effect.Effect<FindingComment, NotFound | Forbidden | ExternalError | DbError> =>
  Effect.gen(function* () {
    const repoId = yield* findingRepoIdEffect(db, accountId, body.repo, body.fingerprint);
    if (!repoId) return yield* new NotFound({ message: "Finding not found" });
    const authorPartyId = yield* Effect.tryPromise({ try: () => actorPartyOf(db, userId), catch: toDbError });
    if (!authorPartyId) return yield* new Forbidden({ message: "A comment needs an author" });
    const sealer = yield* sealerEffect(db, masterKey, accountId);
    return yield* createFindingCommentEffect(
      db,
      {
        tenantId: accountId,
        repoId,
        fingerprint: body.fingerprint,
        authorPartyId,
        body: body.body,
      },
      sealer,
    );
  });
