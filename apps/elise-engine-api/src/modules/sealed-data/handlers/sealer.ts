import { Effect } from "effect";
import type { AppDbType } from "#/lib/db-connection";
import { toExternalError, type DbError, type ExternalError } from "#/lib/effect-query";
import { makeSealer, type Sealer } from "#/modules/sealed-data/utils";
import { ensureDataKeyEffect } from "./unsealer";

export const sealerEffect = (
  db: AppDbType,
  masterSecret: string | undefined,
  accountId: string,
): Effect.Effect<Sealer, ExternalError | DbError> =>
  ensureDataKeyEffect(db, masterSecret, accountId).pipe(
    Effect.map((key) => makeSealer(key, accountId)),
    Effect.mapError((error) => (error._tag === "DataKeyUnavailable" ? toExternalError(error) : error)),
  );
