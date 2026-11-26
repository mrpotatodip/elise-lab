import { z } from "zod";
import { PROJECT_NAME_MAX } from "../constants";

export const ProjectIdSchema = z.uuid();

export const ProjectParamSchema = z.object({
  projectId: ProjectIdSchema,
});

export const ProjectNameSchema = z.string().trim().min(1).max(PROJECT_NAME_MAX);

export const CreateProjectBodySchema = z.object({
  name: ProjectNameSchema,
});

export const RenameProjectBodySchema = CreateProjectBodySchema;

export const ProjectSchema = z.object({
  id: ProjectIdSchema,
  name: z.string(),
  createdAt: z.iso.datetime(),
});

export const ProjectListSchema = z.array(ProjectSchema);

export const ProjectDeletedSchema = z.object({ id: ProjectIdSchema });

// -----
// Move a Repo into a Project, or out of every Project with null.
// -----
export const MoveRepoBodySchema = z.object({
  projectId: ProjectIdSchema.nullable(),
});

export const RepoProjectSchema = z.object({
  repoId: z.uuid(),
  projectId: ProjectIdSchema.nullable(),
});

export type ProjectParam = z.infer<typeof ProjectParamSchema>;
export type CreateProjectBody = z.infer<typeof CreateProjectBodySchema>;
export type RenameProjectBody = z.infer<typeof RenameProjectBodySchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectList = z.infer<typeof ProjectListSchema>;
export type ProjectDeleted = z.infer<typeof ProjectDeletedSchema>;
export type MoveRepoBody = z.infer<typeof MoveRepoBodySchema>;
export type RepoProject = z.infer<typeof RepoProjectSchema>;
