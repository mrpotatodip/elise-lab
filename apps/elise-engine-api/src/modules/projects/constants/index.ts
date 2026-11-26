export const PROJECT_NOT_FOUND = "Project not found";
export const PROJECT_NAME_TAKEN = "A project with this name already exists";
export const PROJECT_LIMIT_REACHED = "This account has reached its limit of projects";
export const PROJECT_REPO_NOT_FOUND = "Repo not found";

// -----
// The unique index on (account, lower(name)), to tell a taken name from any other clash
// -----
export const PROJECT_NAME_CONSTRAINT = "uq_tenant_projects_tenant_name";
