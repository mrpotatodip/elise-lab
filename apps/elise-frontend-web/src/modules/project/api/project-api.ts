import { createServerFn } from "@tanstack/react-start";
import { engineJson, jsonPost } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";
import {
  CreateProjectInputSchema,
  MoveRepoInputSchema,
  ProjectDeletedSchema,
  ProjectInputSchema,
  ProjectListSchema,
  ProjectSchema,
  RenameProjectInputSchema,
  RepoProjectSchema,
} from "../schemas";

export const fetchProjects = createServerFn({ method: "GET" }).handler(async () =>
  engineJson(ProjectListSchema, "/projects", {}, await engineAuth()),
);

export const createProject = createServerFn({ method: "POST" })
  .validator(CreateProjectInputSchema)
  .handler(async ({ data }) =>
    engineJson(ProjectSchema, "/projects", jsonPost(JSON.stringify(data)), await engineAuth()),
  );

export const renameProject = createServerFn({ method: "POST" })
  .validator(RenameProjectInputSchema)
  .handler(async ({ data }) =>
    engineJson(
      ProjectSchema,
      `/projects/${data.projectId}`,
      { ...jsonPost(JSON.stringify({ name: data.name })), method: "PATCH" },
      await engineAuth(),
    ),
  );

export const deleteProject = createServerFn({ method: "POST" })
  .validator(ProjectInputSchema)
  .handler(async ({ data }) =>
    engineJson(ProjectDeletedSchema, `/projects/${data.projectId}`, { method: "DELETE" }, await engineAuth()),
  );

export const moveRepoToProject = createServerFn({ method: "POST" })
  .validator(MoveRepoInputSchema)
  .handler(async ({ data }) =>
    engineJson(
      RepoProjectSchema,
      `/repos/${data.repoId}/project`,
      { ...jsonPost(JSON.stringify({ projectId: data.projectId })), method: "PUT" },
      await engineAuth(),
    ),
  );
