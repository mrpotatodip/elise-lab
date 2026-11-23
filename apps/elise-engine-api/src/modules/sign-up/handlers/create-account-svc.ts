import { Effect } from "effect";
import { hashPassword } from "better-auth/crypto";
import type { SignUp, SignUpBody } from "@repo/contracts/elise";
import type { PoolDbType } from "#/lib/db-connection";
import { Conflict, type DbError } from "#/lib/effect-query";
import { SIGN_UP_REFUSED, SIGN_UP_SLUG_MAX_ATTEMPTS } from "#/modules/sign-up/constants";
import { insertAccountEffect, pickFreeSlugEffect, replaceUnverifiedLoginEffect } from "#/modules/sign-up/queries";
import type { NewAccount } from "#/modules/sign-up/types";

type Failure = Conflict | DbError;

// -----
// Pick a slug and insert. If a concurrent sign-up
// took the slug between the two, pick again.
// -----
const insertWithFreshSlug = (db: PoolDbType, account: Omit<NewAccount, "slug">, attempt: number): Effect.Effect<SignUp, Failure> =>
  Effect.gen(function* () {
    const slug = yield* pickFreeSlugEffect(db, account.accountName);
    return yield* insertAccountEffect(db, { ...account, slug }).pipe(
      Effect.catchTag("SlugTaken", () =>
        attempt >= SIGN_UP_SLUG_MAX_ATTEMPTS
          ? Effect.fail(new Conflict({ message: SIGN_UP_REFUSED }))
          : insertWithFreshSlug(db, account, attempt + 1),
      ),
    );
  });

// -----
// A visitor starts their account: no code, a plan
// is what gates a Scan.
// -----
export const createAccountSvc = (db: PoolDbType, body: SignUpBody): Effect.Effect<SignUp, Failure> =>
  Effect.gen(function* () {
    const passwordHash = yield* Effect.promise(() => hashPassword(body.password));
    yield* replaceUnverifiedLoginEffect(db, body.email);
    return yield* insertWithFreshSlug(
      db,
      {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        passwordHash,
        accountName: body.accountName,
        timezone: body.timezone,
      },
      1,
    );
  });
