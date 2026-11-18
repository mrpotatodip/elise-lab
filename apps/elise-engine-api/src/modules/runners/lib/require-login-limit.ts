import { ForbiddenError } from "#/lib/errors";
import { rateLimitByIp, rateLimitTotal } from "#/lib/rate-limit";
import { RUNNER_LOGIN_LIMITED } from "#/modules/runners/constants";

const refuse = () => new ForbiddenError(RUNNER_LOGIN_LIMITED);

// -----
// Starting a login makes a row and a pair of codes for anyone, so
// it is limited like enroll: per IP first, so one noisy address
// does not use up the total, then one total for every address.
// Over either limit it answers 403 with one body.
// -----
export const requireLoginStartLimit = rateLimitByIp("RUNNER_LOGIN_START_LIMITER", refuse);
export const requireLoginStartTotalLimit = rateLimitTotal("RUNNER_LOGIN_START_TOTAL_LIMITER", refuse);
