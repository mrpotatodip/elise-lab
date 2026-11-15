import { and, desc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { FINDING_THREAD_EVENT_LIMIT, type FindingCommentsQuery, type FindingThreadEvent } from "@repo/contracts/elise";
import { partyPersons, scanFindingComments, scanRepos } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { canonicalRepo } from "#/modules/scan-ledger";
import { findingCommentView } from "./finding-comment-view";

// -----
// A Finding's thread, oldest first, at most
// FINDING_THREAD_EVENT_LIMIT events. Today an event is a
// comment; the triage decisions join them here.
// -----
export const findingThreadEffect = (db: AppDbType, tenantId: string, query: FindingCommentsQuery): Effect.Effect<FindingThreadEvent[], DbError> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .select({ comment: scanFindingComments, person: partyPersons })
        .from(scanFindingComments)
        .leftJoin(partyPersons, eq(partyPersons.partyId, scanFindingComments.authorPartyId))
        .where(
          and(
            eq(scanFindingComments.tenantId, tenantId),
            eq(scanFindingComments.fingerprint, query.fingerprint),
            inArray(
              scanFindingComments.repoId,
              db.select({ id: scanRepos.id }).from(scanRepos).where(and(eq(scanRepos.tenantId, tenantId), eq(scanRepos.canonical, canonicalRepo(query.repo)))),
            ),
          ),
        )
        .orderBy(desc(scanFindingComments.createdAt), desc(scanFindingComments.id))
        .limit(FINDING_THREAD_EVENT_LIMIT);
      return rows.toReversed().map(({ comment, person }) => findingCommentView(comment, person));
    },
    catch: toDbError,
  });
