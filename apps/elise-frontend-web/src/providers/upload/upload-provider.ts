import type { SourceProvider } from "#/providers/port";
import { UploadAppPanel, UploadScanPicker } from "#/providers/upload/components";

// -----
// An upload app: zips of source code under a name, no git
// host (ADR 0008). The new-scan form shows its picker in place
// of the search: an app, its zips, and the one zip a Scan reads.
// Its Repo page adds the zips and a way to remove the app.
// -----
export const uploadProvider = {
  id: "upload",
  label: "Upload",
  available: true,
  capabilities: { canListRepos: false, hasBranches: false, isArchive: true, cloudScans: false },
  address: null,
  Help: null,
  ArchivePicker: UploadScanPicker,
  RepoPanel: UploadAppPanel,
} as const satisfies SourceProvider;
