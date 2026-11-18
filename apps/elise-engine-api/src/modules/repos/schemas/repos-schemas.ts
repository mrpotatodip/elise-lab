import { z } from "zod";
import { REPO_BRANCH_LIMIT } from "@repo/contracts/elise";
import { SCANS_GIT_REF, SCANS_PROVIDER } from "#/modules/scans/constants";
import { checkRepoAddress } from "#/modules/scans/schemas";

export const AddRepoBodySchema = z
  .object({
    provider: SCANS_PROVIDER,
    repo: z.string().meta({ example: "https://github.com/octocat/Hello-World", description: "The repository's https address, read by the provider's own rules." }),
    branches: z
      .array(z.string().regex(SCANS_GIT_REF))
      .max(REPO_BRANCH_LIMIT)
      .optional()
      .meta({ example: ["main", "release"], description: `Branches to track, at most ${REPO_BRANCH_LIMIT} in all. Leave them out to track only the default branch once it is scanned.` }),
  })
  .superRefine(checkRepoAddress);

export const AddBranchBodySchema = z.object({
  name: z.string().regex(SCANS_GIT_REF).meta({ example: "release", description: "The exact name of the branch. Case counts." }),
});

export type AddRepoBody = z.infer<typeof AddRepoBodySchema>;
export type AddBranchBody = z.infer<typeof AddBranchBodySchema>;
