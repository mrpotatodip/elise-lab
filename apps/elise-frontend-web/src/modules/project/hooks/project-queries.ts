import { queryOptions } from "@tanstack/react-query";
import { fetchProjects } from "../api";

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
};

export const projectsQuery = () => queryOptions({ queryKey: projectKeys.list(), queryFn: () => fetchProjects() });
