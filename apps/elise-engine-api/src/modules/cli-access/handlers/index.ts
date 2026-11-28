import { Effect } from "effect";
import type { CliAccessList, CliAccessRevoked, CliAccessScope } from "@repo/contracts/elise";
import type { AppDbType, DbConnectType } from "#/lib/db-connection";
import { NotFound, type DbError } from "#/lib/effect-query";
import { CLI_ACCESS_NOT_FOUND } from "#/modules/cli-access/constants";
import { findCliAccessByTokenEffect, listCliAccessEffect, revokeCliAccessEffect } from "#/modules/cli-access/queries";
import type { CliAccessIdentity } from "#/modules/cli-access/types";
import { hashCliAccessToken } from "#/modules/cli-access/utils";

export const listCliAccessSvc = (db: AppDbType, accountId: string): Effect.Effect<CliAccessList, DbError> =>
  listCliAccessEffect(db, accountId);

export const revokeCliAccessSvc = (
  db: AppDbType,
  accountId: string,
  cliAccessId: string,
  actorUserId: string,
): Effect.Effect<CliAccessRevoked, NotFound | DbError> =>
  revokeCliAccessEffect(db, { tenantId: accountId, cliAccessId, actorUserId, now: new Date() }).pipe(
    Effect.flatMap((revoked) =>
      revoked
        ? Effect.succeed({ revoked: true as const })
        : Effect.fail(new NotFound({ message: CLI_ACCESS_NOT_FOUND })),
    ),
  );

export const cliAccessIdentitySvc = (
  db: DbConnectType,
  token: string,
  needed: CliAccessScope | null,
): Effect.Effect<CliAccessIdentity | null, DbError> =>
  Effect.gen(function* () {
    const tokenHash = yield* Effect.promise(() => hashCliAccessToken(token));
    return yield* findCliAccessByTokenEffect(db, tokenHash, new Date(), needed);
  });
