import { eq } from "drizzle-orm";
import { Effect } from "effect";
import type { FindingComment } from "@repo/contracts/elise";
import { partyPersons, scanFindingComments } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import type { Sealer } from "#/modules/sealed-data";
import { findingCommentView } from "./finding-comment-view";

export type NewFindingComment = {
  tenantId: string;
  repoId: string;
  fingerprint: string;
  authorPartyId: string | null;
  body: string;
};

export const createFindingCommentEffect = (
  db: AppDbType,
  comment: NewFindingComment,
  sealer: Sealer,
): Effect.Effect<FindingComment, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db
        .insert(scanFindingComments)
        .values({ ...comment, body: await sealer.text(comment.body) })
        .returning();
      const [person] = comment.authorPartyId
        ? await db.select().from(partyPersons).where(eq(partyPersons.partyId, comment.authorPartyId))
        : [];
      return findingCommentView({ ...row, body: comment.body }, person);
    },
    catch: toDbError,
  });
