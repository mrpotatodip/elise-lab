import { z } from "zod";
import {
  CreateProjectBodySchema,
  MoveRepoBodySchema,
  ProjectNameSchema,
  ProjectParamSchema,
  RenameProjectBodySchema,
} from "@repo/contracts/elise";

export {
  PROJECT_LIMIT_PER_TENANT,
  PROJECT_NAME_MAX,
  ProjectDeletedSchema,
  ProjectListSchema,
  ProjectSchema,
  RepoProjectSchema,
} from "@repo/contracts/elise";
export type { Project, ProjectList } from "@repo/contracts/elise";

export const CreateProjectInputSchema = CreateProjectBodySchema;
export const ProjectInputSchema = ProjectParamSchema;
export const RenameProjectInputSchema = ProjectParamSchema.and(RenameProjectBodySchema);
export const MoveRepoInputSchema = MoveRepoBodySchema.extend({ repoId: z.uuid() });

export const ProjectNameDetailsSchema = z.object({ name: ProjectNameSchema });
