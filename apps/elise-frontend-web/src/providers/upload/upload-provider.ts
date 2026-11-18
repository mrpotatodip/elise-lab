import type { SourceProvider } from "#/providers/port";

// -----
// An upload app: zips of source code under a name, no git
// host (ADR 0007). Listed so the person sees it; its own
// flow (create an app, upload a zip, pick one per Scan)
// comes with the upload tickets, and opens it.
// -----
export const uploadProvider = {
  id: "upload",
  label: "Upload",
  available: false,
  capabilities: { canListRepos: false, hasBranches: false, isArchive: true, cloudScans: false },
  address: null,
  Help: null,
} as const satisfies SourceProvider;
