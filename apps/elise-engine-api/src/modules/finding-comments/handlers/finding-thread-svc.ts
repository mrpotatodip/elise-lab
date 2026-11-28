import { Effect } from "effect";
import type { FindingCommentsQuery, FindingThread } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import type { DbError } from "#/lib/effect-query";
import { findingThreadEffect } from "#/modules/finding-comments/queries";
import { unsealerEffect } from "#/modules/sealed-data";

export const findingThreadSvc = (
  db: AppDbType,
  accountId: string,
  query: FindingCommentsQuery,
  masterKey: string | undefined,
): Effect.Effect<FindingThread, DbError> =>
  Effect.gen(function* () {
    const unsealer = yield* unsealerEffect(db, masterKey, accountId);
    const events = yield* findingThreadEffect(db, accountId, query, unsealer);
    return { events };
  });
