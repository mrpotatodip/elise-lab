import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { FINDING_THREAD_EVENT_LIMIT, FINDING_TRIAGE_STATUS_VALUES, type FindingCommentsQuery, type FindingThreadEvent } from "@repo/contracts/elise";
import { accessAuditLog } from "@repo/db-elise";
import { partyPersons, scanFindingComments, scanFindingTriage, scanRepos } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { repoIdentityOf, sameRepoIdentity } from "#/modules/scan-ledger";
import { findingCommentView } from "./finding-comment-view";
import { DECISION_ACTIONS, findingDecisionView } from "./finding-decision-view";

const DecisionAfterSchema = z.object({
  status: z.enum(FINDING_TRIAGE_STATUS_VALUES),
  note: z.string().nullish(),
  acceptedUntil: z.iso.datetime().nullish(),
  duplicateOf: z.string().nullish(),
});

const oldestFirst = (a: FindingThreadEvent, b: FindingThreadEvent) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

// -----
// A Finding's thread, oldest first, at most
// FINDING_THREAD_EVENT_LIMIT events: its comments (a deleted
// one is an event too) and the triage decisions in the Audit
// trail. The decisions hang on the Finding's triage row, found
// from repo and fingerprint; a Finding never triaged has none.
// Each source gives its latest FINDING_THREAD_EVENT_LIMIT, so
// the latest of the merge is among them. A row whose `after`
// does not parse is left out.
// -----
export const findingThreadEffect = (db: AppDbType, tenantId: string, query: FindingCommentsQuery): Effect.Effect<FindingThreadEvent[], DbError> =>
  Effect.tryPromise({
    try: async () => {
      const repoIds = db
        .select({ id: scanRepos.id })
        .from(scanRepos)
        .where(sameRepoIdentity(tenantId, repoIdentityOf(query.repo)));
      const commentRows = await db
        .select({ comment: scanFindingComments, person: partyPersons })
        .from(scanFindingComments)
        .leftJoin(partyPersons, eq(partyPersons.partyId, scanFindingComments.authorPartyId))
        .where(and(eq(scanFindingComments.tenantId, tenantId), eq(scanFindingComments.fingerprint, query.fingerprint), inArray(scanFindingComments.repoId, repoIds)))
        .orderBy(desc(scanFindingComments.createdAt), desc(scanFindingComments.id))
        .limit(FINDING_THREAD_EVENT_LIMIT);
      const decisionRows = await db
        .select({ entry: accessAuditLog, person: partyPersons })
        .from(accessAuditLog)
        .leftJoin(partyPersons, eq(partyPersons.partyId, accessAuditLog.actorPartyId))
        .where(
          and(
            inArray(accessAuditLog.action, DECISION_ACTIONS),
            sql`${accessAuditLog.after}->>'tenantId' = ${tenantId}`,
            inArray(
              accessAuditLog.subjectId,
              db
                .select({ id: scanFindingTriage.id })
                .from(scanFindingTriage)
                .where(and(eq(scanFindingTriage.tenantId, tenantId), eq(scanFindingTriage.fingerprint, query.fingerprint), inArray(scanFindingTriage.repoId, repoIds))),
            ),
          ),
        )
        .orderBy(desc(accessAuditLog.createdAt), desc(accessAuditLog.id))
        .limit(FINDING_THREAD_EVENT_LIMIT);
      const comments = commentRows.map(({ comment, person }) => findingCommentView(comment, person));
      const decisions = decisionRows.flatMap(({ entry, person }) => {
        const after = DecisionAfterSchema.safeParse(entry.after);
        return after.success ? [findingDecisionView(entry, after.data, person)] : [];
      });
      return [...comments, ...decisions].toSorted(oldestFirst).slice(-FINDING_THREAD_EVENT_LIMIT);
    },
    catch: toDbError,
  });
