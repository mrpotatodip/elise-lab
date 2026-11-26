import { Effect } from "effect";
import type { HandoverFile } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { toExternalError, type DbError } from "#/lib/effect-query";
import { decidedBranchIdEffect } from "#/modules/decided-problems/queries";
import { previousMapKeysEffect } from "#/modules/previous-map/queries";
import { previousMapHandover } from "#/modules/previous-map/utils";

export type PreviousMapStore = { read: (key: string) => Promise<string | null> };

export const r2TextStore = (reports: R2Bucket): PreviousMapStore => ({
  read: (key) => reports.get(key).then((object) => (object === null ? null : object.text())),
});

// -----
// The hand-over of the last map of the Branch the Scan is on: no
// entry for a Branch with none, and a map that R2 no longer holds
// is no map.
// -----
export const previousMapFilesSvc = (
  db: AppDbType,
  store: PreviousMapStore,
  tenantId: string,
  repoUrl: string,
  ref: string | undefined,
): Effect.Effect<HandoverFile[], DbError> =>
  Effect.gen(function* () {
    const branchId = yield* decidedBranchIdEffect(db, tenantId, repoUrl, ref);
    if (branchId === null) return [];
    const keys = yield* previousMapKeysEffect(db, tenantId, branchId);
    if (keys === null) return [];
    const read = (key: string) =>
      Effect.tryPromise({ try: () => store.read(key), catch: toExternalError }).pipe(
        Effect.orElseSucceed((): string | null => null),
      );
    const architecture = yield* read(keys.architectureKey);
    if (architecture === null) return [];
    const ledger = keys.ledgerKey === null ? null : yield* read(keys.ledgerKey);
    return previousMapHandover(architecture, ledger);
  });
