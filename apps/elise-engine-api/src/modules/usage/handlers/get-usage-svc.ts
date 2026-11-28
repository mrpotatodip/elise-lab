import { Effect } from "effect";
import type { Usage } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import type { DbError } from "#/lib/effect-query";
import { activeScansEffect } from "#/modules/scan-ledger";
import { monthSpendEffect } from "#/modules/usage/queries";
import type { UsageEnv } from "#/modules/usage/types";
import { monthStartOf, reservedUsdOf, summarizeUsage } from "#/modules/usage/utils";

export const getUsageSvc = (env: UsageEnv, db: AppDbType, accountId: string): Effect.Effect<Usage, DbError> =>
  Effect.gen(function* () {
    const now = Date.now();
    const spend = yield* monthSpendEffect(db, accountId, monthStartOf(new Date(now)));
    const active = yield* activeScansEffect(db, accountId, now, env.DATA_MASTER_KEY);
    return summarizeUsage(new Date(now), spend, env, reservedUsdOf(active));
  });
