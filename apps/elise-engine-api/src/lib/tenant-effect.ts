import type { Context } from "hono";
import type { Effect } from "effect";
import type { TenantDbType } from "#/lib/db-connection";
import { effectInCallback, type DbError } from "#/lib/effect-query";
import type { AppEnv } from "#/types/variables";

// -----
// One withTenant transaction as an effect: a service that must
// open more than one, or work outside one, takes this in place of
// a database. A failed effect rolls its transaction back.
// -----
export type TenantEffect<D = TenantDbType> = <A, E>(
  run: (db: D) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | DbError>;

export const tenantEffectOf =
  (c: Context<AppEnv>, accountId: string): TenantEffect =>
  (run) =>
    effectInCallback((callback) => c.get("deps").withTenant(c, accountId, callback), run);
