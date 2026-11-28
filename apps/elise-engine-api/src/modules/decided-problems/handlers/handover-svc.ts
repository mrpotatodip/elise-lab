import { Effect } from "effect";
import type { HandoverFile } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import type { DbError } from "#/lib/effect-query";
import { decidedBranchIdEffect, decidedProblemsEffect, openProblemsEffect } from "#/modules/decided-problems/queries";
import { unsealerEffect } from "#/modules/sealed-data";
import { decidedProblemsHandover, openProblemsHandover } from "#/modules/decided-problems/utils";

export const handoverFilesSvc = (
  db: AppDbType,
  tenantId: string,
  repoUrl: string,
  ref: string | undefined,
  masterKey?: string,
): Effect.Effect<HandoverFile[], DbError> =>
  Effect.gen(function* () {
    const branchId = yield* decidedBranchIdEffect(db, tenantId, repoUrl, ref);
    if (branchId === null) return [];
    const unsealer = yield* unsealerEffect(db, masterKey, tenantId);
    const decided = yield* decidedProblemsEffect(db, tenantId, branchId, undefined, unsealer);
    const open = yield* openProblemsEffect(db, tenantId, branchId, undefined, unsealer);
    return [...decidedProblemsHandover(decided), ...openProblemsHandover(open)];
  });
