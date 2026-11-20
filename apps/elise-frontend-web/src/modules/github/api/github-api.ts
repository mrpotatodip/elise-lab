import { createServerFn } from "@tanstack/react-start";
import { engineJson } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";
import { GithubBranchesQuerySchema, GithubBranchesSchema, GithubReposSchema } from "../schemas";

export const fetchGithubRepos = createServerFn({ method: "GET" }).handler(async () => engineJson(GithubReposSchema, "/github/repos", {}, await engineAuth()));

export const fetchGithubBranches = createServerFn({ method: "GET" })
  .validator(GithubBranchesQuerySchema)
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ installationId: data.installationId, repo: data.repo });
    return engineJson(GithubBranchesSchema, `/github/branches?${params}`, {}, await engineAuth());
  });
