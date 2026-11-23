import type { Context } from "hono";
import { Effect } from "effect";
import { authConfigOf, buildAuth } from "#/lib/auth";
import type { PoolDbType } from "#/lib/db-connection";
import type { AppEnv } from "#/types/variables";

export const sendVerificationEmailQuietly = (c: Context<AppEnv>, db: PoolDbType, email: string): Effect.Effect<void> =>
  Effect.tryPromise({
    try: () => buildAuth(authConfigOf(c, db)).api.sendVerificationEmail({ body: { email } }),
    catch: (cause) => cause,
  }).pipe(
    Effect.match({ onSuccess: () => undefined, onFailure: () => console.error("Verification email not queued") }),
  );
