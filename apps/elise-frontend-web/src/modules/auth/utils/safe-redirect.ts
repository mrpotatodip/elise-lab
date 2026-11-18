const FIRST_PRINTABLE = 32;

const isSafePath = (value: string): boolean =>
  value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && [...value].every((char) => (char.codePointAt(0) ?? 0) >= FIRST_PRINTABLE);

// -----
// Where sign-in may send a person next: a path on this site, never another
// host. "//host", "/\host" and anything with a control character are refused.
// -----
export const safeRedirectPath = (value: string | undefined): string | undefined => (value !== undefined && isSafePath(value) ? value : undefined);
