import type { Effect } from "effect";
import type { UsageBudgetChange } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import type { DbError } from "#/lib/effect-query";
import { budgetChangesEffect } from "#/modules/usage/queries";

export const getBudgetChangesSvc = (db: AppDbType, accountId: string): Effect.Effect<UsageBudgetChange[], DbError> =>
  budgetChangesEffect(db, accountId);
