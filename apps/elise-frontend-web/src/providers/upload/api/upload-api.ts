import { createServerFn } from "@tanstack/react-start";
import {
  CreateUploadAppInputSchema,
  RepoDetailSchema,
  RepoListSchema,
  RepoParamSchema,
  UploadArchiveFormSchema,
  UploadArchiveListSchema,
  UploadArchiveParamSchema,
  UploadArchiveRemovedSchema,
  UploadArchiveSchema,
} from "#/providers/upload/schemas";
import { engineJson, jsonPost } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";

// -----
// Upload apps are Repos with provider upload. The list is the
// Account's Repos, read for its upload apps: a removed app is
// no longer in it.
// -----
export const fetchUploadApps = createServerFn({ method: "GET" }).handler(async () => {
  const { repos } = await engineJson(RepoListSchema, "/repos", {}, await engineAuth());
  return repos.filter((repo) => repo.provider === "upload");
});

// -----
// The engine answers an existing name (in any case) with that
// app, so a second create opens the same app.
// -----
export const createUploadApp = createServerFn({ method: "POST" })
  .validator(CreateUploadAppInputSchema)
  .handler(async ({ data }) =>
    engineJson(
      RepoDetailSchema,
      "/repos",
      jsonPost(JSON.stringify({ provider: "upload", repo: data.name })),
      await engineAuth(),
    ),
  );

export const fetchUploadArchives = createServerFn({ method: "GET" })
  .validator(RepoParamSchema)
  .handler(async ({ data }) =>
    engineJson(UploadArchiveListSchema, `/repos/${data.repoId}/archives`, {}, await engineAuth()),
  );

// -----
// The zip goes to the engine as its raw bytes, with the file's
// name as its label.
// -----
export const uploadArchive = createServerFn({ method: "POST" })
  .validator(UploadArchiveFormSchema)
  .handler(async ({ data }) =>
    engineJson(
      UploadArchiveSchema,
      `/repos/${data.repoId}/archives?label=${encodeURIComponent(data.label)}`,
      { method: "POST", headers: { "Content-Type": "application/zip" }, body: data.file },
      await engineAuth(),
    ),
  );

export const removeUploadArchive = createServerFn({ method: "POST" })
  .validator(UploadArchiveParamSchema)
  .handler(async ({ data }) =>
    engineJson(
      UploadArchiveRemovedSchema,
      `/repos/${data.repoId}/archives/${data.archiveId}`,
      { method: "DELETE" },
      await engineAuth(),
    ),
  );
