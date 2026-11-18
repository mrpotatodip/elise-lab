import { z } from "zod";
import { UPLOAD_ARCHIVE_LABEL_MAX } from "../constants";

// -----
// The upload provider (docs/adr/0007-git-providers.md). An upload
// app is a Repo with provider upload, made with POST /repos. Each
// zip stored under it is an archive: its label, size, the SHA-256
// of its bytes (the app's History reads it as the commit) and when
// it was uploaded.
// -----
export const UploadArchiveSchema = z.object({
  id: z.uuid(),
  repoId: z.uuid(),
  label: z.string(),
  sizeBytes: z.number().int().min(0),
  contentSha256: z.string(),
  uploadedAt: z.iso.datetime(),
});

export const UploadArchiveListSchema = z.object({ archives: z.array(UploadArchiveSchema) });

export const UploadArchiveParamSchema = z.object({ repoId: z.uuid(), archiveId: z.uuid() });

export const UploadArchiveQuerySchema = z.object({ label: z.string().trim().min(1).max(UPLOAD_ARCHIVE_LABEL_MAX) });

export const UploadArchiveRemovedSchema = z.object({ removed: z.literal(true) });

// -----
// The zip an upload Scan read, as its Scan shows it. id is null
// once the zip is removed: the label and hash stay, so the
// History can say the file is gone.
// -----
export const ScanArchiveRefSchema = z.object({
  id: z.uuid().nullable(),
  label: z.string(),
  contentSha256: z.string(),
});

export type ScanArchiveRef = z.infer<typeof ScanArchiveRefSchema>;
export type UploadArchive = z.infer<typeof UploadArchiveSchema>;
export type UploadArchiveList = z.infer<typeof UploadArchiveListSchema>;
export type UploadArchiveParam = z.infer<typeof UploadArchiveParamSchema>;
export type UploadArchiveQuery = z.infer<typeof UploadArchiveQuerySchema>;
export type UploadArchiveRemoved = z.infer<typeof UploadArchiveRemovedSchema>;
