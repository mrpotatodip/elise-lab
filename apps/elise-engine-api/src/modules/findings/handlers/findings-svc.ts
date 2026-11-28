import { Effect } from "effect";
import type { FindingList, FindingsQuery, FindingTriage, FindingTriageBody } from "@repo/contracts/elise";
import type { AppDbType, TenantDbType } from "#/lib/db-connection";
import { Forbidden, Invalid, NotFound, type DbError, type ExternalError } from "#/lib/effect-query";
import { sealerEffect, unsealerEffect } from "#/modules/sealed-data";
import { findingRepoIdEffect, listFindingsEffect, setTriageEffect } from "#/modules/findings/queries";

// -----
// One more row than asked tells whether another
// page exists; the cursor is the next offset.
// -----
export const listFindingsSvc = (
  db: AppDbType,
  accountId: string,
  query: FindingsQuery,
  masterKey: string | undefined,
): Effect.Effect<FindingList, DbError> =>
  Effect.gen(function* () {
    const unsealer = yield* unsealerEffect(db, masterKey, accountId);
    const rows = yield* listFindingsEffect(db, accountId, query, unsealer);
    const hasMore = rows.length > query.limit;
    const offset = query.cursor ? Number(query.cursor) : 0;
    return { findings: rows.slice(0, query.limit), nextCursor: hasMore ? String(offset + query.limit) : null };
  });

// -----
// Any triage decision, audited, in the one transaction
// of withTenant, so a failed audit row leaves no decision.
// userId is the signed-in login,
// or undefined for the service token. For an accepted risk the
// caller has already proved userId is an admin of the account.
// -----
export const setFindingTriageSvc = (
  db: TenantDbType,
  accountId: string,
  body: FindingTriageBody,
  userId: string | undefined,
  masterKey: string | undefined,
): Effect.Effect<FindingTriage, NotFound | Forbidden | Invalid | ExternalError | DbError> =>
  Effect.gen(function* () {
    const repoId = yield* findingRepoIdEffect(db, accountId, body.repo, body.fingerprint);
    if (!repoId) return yield* new NotFound({ message: "Finding not found" });
    const sealer = yield* sealerEffect(db, masterKey, accountId);
    return yield* setTriageEffect(db, accountId, repoId, body, userId, new Date(), sealer);
  });
