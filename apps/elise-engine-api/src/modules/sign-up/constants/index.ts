// -----
// Messages
// -----
export const SIGN_UP_RATE_LIMITED = "Too many sign-up attempts. Wait a minute and try again.";
export const SIGN_UP_RATE_LIMITED_CODE = "SIGN_UP_RATE_LIMITED";
export const SIGN_UP_EMAIL_TAKEN = "An account with this email already exists";
export const SIGN_UP_SLUG_EXHAUSTED = "Could not pick an address for this account. Try again.";

// -----
// Tenant slug: from the account name, up to 40
// characters. A clash gets -2, -3 ... and a race
// between two sign-ups is retried up to 5 times.
// -----
export const SIGN_UP_SLUG_MAX_LENGTH = 40;
export const SIGN_UP_SLUG_MAX_ATTEMPTS = 5;
export const SIGN_UP_SLUG_CANDIDATE_COUNT = 50;
export const SIGN_UP_SLUG_FALLBACK = "account";
export const SIGN_UP_SLUG_CONSTRAINT = "uq_tenants_slug";

// -----
// Words that name a route, a page or a service,
// so an account can never take them as its address.
// -----
export const SIGN_UP_RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "api",
  "admin",
  "www",
  "auth",
  "app",
  "dashboard",
  "docs",
  "health",
  "help",
  "login",
  "logout",
  "me",
  "openapi",
  "public",
  "scans",
  "settings",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "static",
  "support",
  "tenants",
]);
