import { Effect } from "effect";
import { buildAuth, type AuthConfig } from "#/lib/auth";
import { VERIFICATION_EMAIL_NOT_QUEUED_LOG } from "#/modules/sign-up/constants";

export const sendVerificationEmailQuietly = (config: AuthConfig, email: string): Effect.Effect<void> =>
  Effect.tryPromise({
    try: () => buildAuth(config).api.sendVerificationEmail({ body: { email } }),
    catch: (cause) => cause,
  }).pipe(
    Effect.match({
      onSuccess: () => undefined,
      onFailure: (cause) => console.error(VERIFICATION_EMAIL_NOT_QUEUED_LOG, cause),
    }),
  );
