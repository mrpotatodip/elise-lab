import { UPLOAD_APP_NAME_MESSAGE, UPLOAD_APP_NAME_PATTERN } from "@repo/contracts/elise";
import type { SourceProvider } from "#/providers/port";

// -----
// An upload app: zips the user uploads, not a git host. Its
// address is the app's name (the contracts' name rule), its
// path the name in lowercase (so "Billing" and "billing" are
// one app of an Account), and it has no host. Its Scans all sit
// on the one hidden Branch "upload", so the zips are versions in
// one History.
// -----
export const uploadProvider = {
  id: "upload",
  capabilities: { canListRepos: false, hasBranches: false, isArchive: true, cloudScans: false },
  addressPattern: UPLOAD_APP_NAME_PATTERN,
  addressMessage: UPLOAD_APP_NAME_MESSAGE,
  fixedBranch: "upload",
  host: (): null => null,
  canonical: (address: string): string => address.toLowerCase(),
  display: (address: string): string => address,
} as const satisfies SourceProvider;
