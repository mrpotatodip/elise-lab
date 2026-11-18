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
  capabilities: { canListRepos: false, hasBranches: false, isArchive: true },
  addressPattern: UPLOAD_APP_NAME,
  fixedBranch: "upload",
  host: (): null => null,
  canonical: (address: string): string => address.toLowerCase(),
  display: (address: string): string => address,
} as const satisfies SourceProvider;
