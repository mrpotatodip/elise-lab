import { Effect } from "effect";
import type { HandoverFile } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import type { DbError } from "#/lib/effect-query";
import { decidedBranchIdEffect, decidedProblemsEffect } from "#/modules/decided-problems/queries";
import { decidedProblemsHandover } from "#/modules/decided-problems/utils";

export const handoverFilesSvc = (
  db: AppDbType,
  tenantId: string,
  repoUrl: string,
  ref: string | undefined,
): Effect.Effect<HandoverFile[], DbError> =>
  Effect.gen(function* () {
    const branchId = yield* decidedBranchIdEffect(db, tenantId, repoUrl, ref);
    if (branchId === null) return [];
    return decidedProblemsHandover(yield* decidedProblemsEffect(db, tenantId, branchId));
  });
