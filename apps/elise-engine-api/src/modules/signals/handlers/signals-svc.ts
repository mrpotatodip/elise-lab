import { Effect } from "effect";
import type { Signal, SignalsSettings } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { NotFound, type DbError } from "#/lib/effect-query";
import { dismissSignalEffect, findSignalsSettingsEffect, listSignalsEffect, setSignalsEnabledEffect } from "#/modules/signals/queries";

export const getSignalsSettingsSvc = (db: AppDbType, accountId: string): Effect.Effect<SignalsSettings, DbError> => findSignalsSettingsEffect(db, accountId);

export const setSignalsEnabledSvc = (db: AppDbType, accountId: string, userId: string, enabled: boolean): Effect.Effect<SignalsSettings, DbError> =>
  setSignalsEnabledEffect(db, accountId, userId, enabled);

export const listSignalsSvc = (db: AppDbType, accountId: string, repo: string): Effect.Effect<Signal[], DbError> => listSignalsEffect(db, accountId, repo);

export const dismissSignalSvc = (db: AppDbType, accountId: string, signalId: string): Effect.Effect<{ dismissed: true }, NotFound | DbError> =>
  Effect.gen(function* () {
    const found = yield* dismissSignalEffect(db, accountId, signalId);
    if (!found) return yield* new NotFound({ message: "Signal not found" });
    return { dismissed: true as const };
  });
