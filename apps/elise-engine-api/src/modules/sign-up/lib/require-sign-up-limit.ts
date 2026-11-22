import { TooManyRequestsError } from "#/lib/errors";
import { rateLimitByIp, rateLimitTotal } from "#/lib/rate-limit";
import { SIGN_UP_RATE_LIMITED, SIGN_UP_RATE_LIMITED_CODE } from "#/modules/sign-up/constants";

const refuse = () => new TooManyRequestsError(SIGN_UP_RATE_LIMITED, SIGN_UP_RATE_LIMITED_CODE);

// -----
// Over a limit it answers 429 with its own message.
// The total limit holds when one caller rotates IPs.
// -----
export const requireSignUpLimit = rateLimitByIp("SIGN_UP_LIMITER", refuse);
export const requireSignUpTotalLimit = rateLimitTotal("SIGN_UP_TOTAL_LIMITER", refuse);
