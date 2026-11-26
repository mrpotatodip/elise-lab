import { z } from "zod";
import { CreateProjectBodySchema, MoveRepoBodySchema, PROJECT_NAME_MAX, ProjectParamSchema, RenameProjectBodySchema } from "@repo/contracts/elise";

export { PROJECT_LIMIT_PER_TENANT, PROJECT_NAME_MAX, ProjectDeletedSchema, ProjectListSchema, ProjectSchema, RepoProjectSchema } from "@repo/contracts/elise";
export type { Project, ProjectList } from "@repo/contracts/elise";

export const CreateProjectInputSchema = CreateProjectBodySchema;
export const ProjectInputSchema = ProjectParamSchema;
export const RenameProjectInputSchema = ProjectParamSchema.and(RenameProjectBodySchema);
export const MoveRepoInputSchema = MoveRepoBodySchema.extend({ repoId: z.uuid() });

export const ProjectNameDetailsSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(PROJECT_NAME_MAX, `Use ${PROJECT_NAME_MAX} characters or fewer.`),
});
