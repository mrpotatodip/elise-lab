import { z } from "zod";
import {
  RepoParamSchema,
  UPLOAD_APP_NAME_MESSAGE,
  UPLOAD_APP_NAME_PATTERN,
  UPLOAD_ARCHIVE_LABEL_MAX,
} from "@repo/contracts/elise";

export {
  RepoDetailSchema,
  RepoListSchema,
  RepoParamSchema,
  UploadArchiveListSchema,
  UploadArchiveParamSchema,
  UploadArchiveRemovedSchema,
  UploadArchiveSchema,
} from "@repo/contracts/elise";
export type { Repo, UploadArchive } from "@repo/contracts/elise";

// -----
// A new upload app: its name, by the contracts' name rule.
// -----
export const CreateUploadAppInputSchema = z.object({
  name: z.string().trim().regex(UPLOAD_APP_NAME_PATTERN, UPLOAD_APP_NAME_MESSAGE),
});

// -----
// A zip on its way up: the browser sends it as form data, with
// the app it goes under. The label is the file's name, cut to
// the length the engine keeps.
// -----
export const UploadArchiveFormSchema = z
  .instanceof(FormData)
  .transform((form) => ({ repoId: form.get("repoId"), file: form.get("file") }))
  .pipe(RepoParamSchema.extend({ file: z.instanceof(File) }))
  .transform(({ repoId, file }) => ({ repoId, file, label: file.name.slice(0, UPLOAD_ARCHIVE_LABEL_MAX) }));

export type CreateUploadAppInput = z.infer<typeof CreateUploadAppInputSchema>;
