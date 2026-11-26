import { createServerFn } from "@tanstack/react-start";
import {
  AddRepoInputSchema,
  RepoDetailSchema,
  RepoFindingListSchema,
  RepoFindingsPageInputSchema,
  RepoListSchema,
  RepoParamSchema,
  UploadArchiveRemovedSchema,
} from "../schemas";
import { engineJson, jsonPost } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";

export const fetchRepos = createServerFn({ method: "GET" }).handler(async () =>
  engineJson(RepoListSchema, "/repos", {}, await engineAuth()),
);

export const fetchRemovedRepos = createServerFn({ method: "GET" }).handler(async () =>
  engineJson(RepoListSchema, "/repos?removed=true", {}, await engineAuth()),
);

export const removeRepo = createServerFn({ method: "POST" })
  .validator(RepoParamSchema)
  .handler(async ({ data }) =>
    engineJson(UploadArchiveRemovedSchema, `/repos/${data.repoId}`, { method: "DELETE" }, await engineAuth()),
  );

export const restoreRepo = createServerFn({ method: "POST" })
  .validator(RepoParamSchema)
  .handler(async ({ data }) =>
    engineJson(RepoDetailSchema, `/repos/${data.repoId}/restore`, { method: "POST" }, await engineAuth()),
  );

export const fetchRepo = createServerFn({ method: "GET" })
  .validator(RepoParamSchema)
  .handler(async ({ data }) => engineJson(RepoDetailSchema, `/repos/${data.repoId}`, {}, await engineAuth()));

export const fetchRepoFindings = createServerFn({ method: "GET" })
  .validator(RepoFindingsPageInputSchema)
  .handler(async ({ data: { repoId, ...filter } }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) if (value !== undefined) params.set(key, value);
    const query = params.size > 0 ? `?${params}` : "";
    return engineJson(RepoFindingListSchema, `/repos/${repoId}/findings${query}`, {}, await engineAuth());
  });

export const addRepo = createServerFn({ method: "POST" })
  .validator(AddRepoInputSchema)
  .handler(async ({ data }) =>
    engineJson(RepoDetailSchema, "/repos", jsonPost(JSON.stringify(data)), await engineAuth()),
  );
