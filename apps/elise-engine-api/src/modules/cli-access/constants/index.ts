// -----
// A token starts with a prefix, so a leaked one is easy to find
// and never mistaken for a Runner token (elr_).
// -----
export const CLI_ACCESS_TOKEN_PREFIX = "elc_";
export const CLI_ACCESS_NOT_FOUND = "CLI access not found";
export const CLI_ACCESS_REFUSED = "This CLI access cannot do this";
export const CLI_ACCESS_ROUTE_REFUSED = "This CLI access does not reach this route";
export const CLI_ACCESS_TOUCH_INTERVAL_MS = 60_000;
export const CLI_ACCESS_OTHER_ACCOUNT = "This CLI access belongs to another account";
export const CLI_ACCESS_NO_CHOICE = "runScans: choose to run Scans on this computer, to give CLI access, or both";
export const CLI_ACCESS_ROLE_REFUSED = "Your role in this account cannot give this CLI access";
