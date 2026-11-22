import { TooManyRequestsError } from "#/lib/errors";
import { rateLimitByIp } from "#/lib/rate-limit";
import { SIGN_UP_RATE_LIMITED, SIGN_UP_RATE_LIMITED_CODE } from "#/modules/sign-up/constants";

// -----
// Over the limit it answers 429 with its own message.
// -----
export const requireSignUpLimit = rateLimitByIp("SIGN_UP_LIMITER", () => new TooManyRequestsError(SIGN_UP_RATE_LIMITED, SIGN_UP_RATE_LIMITED_CODE));
