import { Data, Effect } from "effect";
import type { AppDbType } from "#/lib/db-connection";
import type { DbError } from "#/lib/effect-query";
import { findWrappedKeyEffect, insertWrappedKeyEffect } from "#/modules/sealed-data/queries";
import {
  makeDataKey,
  makeUnsealer,
  parseMasterKey,
  unwrapWithSecret,
  type DataKey,
  type Unsealer,
} from "#/modules/sealed-data/utils";

export const unsealerEffect = (
  db: AppDbType,
  masterSecret: string | undefined,
  accountId: string,
): Effect.Effect<Unsealer, DbError> =>
  Effect.gen(function* () {
    const wrapped = yield* findWrappedKeyEffect(db, accountId);
    if (wrapped === null) return makeUnsealer(null, accountId);
    const key = yield* Effect.promise(() => unwrapWithSecret(masterSecret, accountId, wrapped));
    return makeUnsealer(key, accountId);
  });

export class DataKeyUnavailable extends Data.TaggedError("DataKeyUnavailable")<{ accountId: string }> {}

export const ensureDataKeyEffect = (
  db: AppDbType,
  masterSecret: string | undefined,
  accountId: string,
): Effect.Effect<DataKey, DataKeyUnavailable | DbError> =>
  Effect.gen(function* () {
    const master = masterSecret === undefined ? null : yield* Effect.promise(() => parseMasterKey(masterSecret));
    if (master === null) return yield* new DataKeyUnavailable({ accountId });
    const made = yield* Effect.promise(() => makeDataKey(master, accountId));
    const stored = yield* insertWrappedKeyEffect(db, accountId, made.wrapped);
    if (stored === made.wrapped) return made.dataKey;
    const key = yield* Effect.promise(() => unwrapWithSecret(masterSecret, accountId, stored));
    return key ?? (yield* new DataKeyUnavailable({ accountId }));
  });
