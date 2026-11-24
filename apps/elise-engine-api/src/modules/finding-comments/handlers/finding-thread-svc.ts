import { Effect } from "effect";
import type { FindingCommentsQuery, FindingThread } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import type { DbError } from "#/lib/effect-query";
import { findingThreadEffect } from "#/modules/finding-comments/queries";

export const findingThreadSvc = (
  db: AppDbType,
  accountId: string,
  query: FindingCommentsQuery,
): Effect.Effect<FindingThread, DbError> =>
  Effect.map(findingThreadEffect(db, accountId, query), (events) => ({ events }));
