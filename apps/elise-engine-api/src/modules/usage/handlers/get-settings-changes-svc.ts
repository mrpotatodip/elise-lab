import type { Effect } from "effect";
import type { SettingsChange } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import type { DbError } from "#/lib/effect-query";
import { settingsChangesEffect } from "#/modules/usage/queries";

export const getSettingsChangesSvc = (db: AppDbType, accountId: string): Effect.Effect<SettingsChange[], DbError> => settingsChangesEffect(db, accountId);
