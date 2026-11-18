import type { SourceProvider } from "#/providers/port";

// -----
// An app name: a letter or digit first, then letters, digits,
// spaces, dots, dashes and underscores, ending in no space; at
// most 80 characters. No slash, so a name never reads as a path.
// -----
const UPLOAD_APP_NAME = /^[A-Za-z0-9](?:[\w .-]{0,78}[\w.-])?$/;

// -----
// An upload app: zips the user uploads, not a git host. Its
// address is the app's name, its path the name in lowercase
// (so "Billing" and "billing" are one app of an Account), and
// it has no host. Its Scans all sit on the one hidden Branch
// "upload", so the zips are versions in one History.
// -----
export const uploadProvider = {
  id: "upload",
  capabilities: { canListRepos: false, hasBranches: false, isArchive: true, cloudScans: false },
  addressPattern: UPLOAD_APP_NAME,
  addressMessage: "An app name is letters, digits, spaces, '.', '-' and '_', starts with a letter or digit, has no slash and is at most 80 characters",
  fixedBranch: "upload",
  host: (): null => null,
  canonical: (address: string): string => address.toLowerCase(),
  display: (address: string): string => address,
} as const satisfies SourceProvider;
