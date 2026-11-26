import { queryOptions } from "@tanstack/react-query";
import { fetchUploadApps, fetchUploadArchives } from "#/providers/upload/api";

export const uploadKeys = {
  all: ["upload"] as const,
  apps: () => [...uploadKeys.all, "apps"] as const,
  archives: (repoId: string) => [...uploadKeys.all, "archives", repoId] as const,
};

export const uploadAppsQuery = () => queryOptions({ queryKey: uploadKeys.apps(), queryFn: () => fetchUploadApps() });

export const uploadArchivesQuery = (repoId: string) =>
  queryOptions({ queryKey: uploadKeys.archives(repoId), queryFn: () => fetchUploadArchives({ data: { repoId } }) });
