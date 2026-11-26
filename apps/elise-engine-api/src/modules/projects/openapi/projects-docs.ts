import { describeRoute } from "hono-openapi";
import { ProjectDeletedSchema, ProjectListSchema, ProjectSchema, RepoProjectSchema } from "@repo/contracts/elise";
import {
  EXAMPLE_ACCOUNT_ID,
  EXAMPLE_BASE_URL,
  SERVICE_SECURITY,
  bash,
  envelope,
  errorResponses,
  jsonResponse,
  routeText,
} from "#/lib/openapi";

const SESSION = '  -H "authorization: Bearer $SESSION_TOKEN" \\';
const ACCOUNT = `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`;
const PROJECT_ID = "9b2f6c1e-3a4d-4e5f-8a7b-1c2d3e4f5a6b";
const REPO_ID = "5d1f0c9a-2b3e-4f60-9a71-8b92c3d4e5f6";
const CHECK =
  "The Worker checks the session and that the login's Role in the account named by `x-account-id` holds the Repo Power (`company:repos:delete`, a Tenant admin or Workspace admin), the same one removing a Repo asks for. The service token alone is not enough, because a change names who made it.";

export const listProjectsDoc = describeRoute({
  tags: ["projects"],
  security: SERVICE_SECURITY,
  summary: "List the projects",
  description: routeText({
    context:
      "A Project is a named set of Repos in one account, for example `Storefront`. It groups and rolls up; it scans nothing and grants nothing. Each Repo's `projectId` is on `GET /repos`.",
    steps: [
      "The Worker checks the service token or a session with the dashboard Power.",
      "The Worker returns every Project of the account by name.",
    ],
    example: ["List the projects:", bash(`curl ${EXAMPLE_BASE_URL}/projects \\`, SESSION, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The projects.", envelope(ProjectListSchema)), ...errorResponses(400, 401, 403) },
});

export const createProjectDoc = describeRoute({
  tags: ["projects"],
  security: SERVICE_SECURITY,
  summary: "Make a project",
  description: routeText({
    context:
      "Names are unique inside the account, ignoring case, up to 60 characters. One account can have 50 projects.",
    steps: [
      CHECK,
      "The Worker refuses a name that is taken (409) or the 51st project (409).",
      "The Worker saves the Project and writes an audit row.",
    ],
    example: [
      "Make the Storefront project:",
      bash(
        `curl -X POST ${EXAMPLE_BASE_URL}/projects \\`,
        SESSION,
        ACCOUNT + " \\",
        '  -H "Content-Type: application/json" \\',
        `  -d '{"name":"Storefront"}'`,
      ),
    ],
  }),
  responses: { 201: jsonResponse("The new project.", envelope(ProjectSchema)), ...errorResponses(400, 401, 403, 409) },
});

export const renameProjectDoc = describeRoute({
  tags: ["projects"],
  security: SERVICE_SECURITY,
  summary: "Rename a project",
  description: routeText({
    context: "The same name rule applies.",
    steps: [
      CHECK,
      "The Worker renames the Project, or answers 404 if it is not in the account, or 409 if the name is taken.",
      "The Worker writes an audit row.",
    ],
    example: [
      "Rename it:",
      bash(
        `curl -X PATCH ${EXAMPLE_BASE_URL}/projects/${PROJECT_ID} \\`,
        SESSION,
        ACCOUNT + " \\",
        '  -H "Content-Type: application/json" \\',
        `  -d '{"name":"Shop"}'`,
      ),
    ],
  }),
  responses: {
    200: jsonResponse("The renamed project.", envelope(ProjectSchema)),
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

export const deleteProjectDoc = describeRoute({
  tags: ["projects"],
  security: SERVICE_SECURITY,
  summary: "Delete a project",
  description: routeText({
    context: "Its Repos stay in the account and go back to no project. No Repo, Scan or finding is deleted.",
    steps: [
      CHECK,
      "The Worker deletes the Project, or answers 404 if it is not in the account.",
      "The Worker writes an audit row.",
    ],
    example: ["Delete it:", bash(`curl -X DELETE ${EXAMPLE_BASE_URL}/projects/${PROJECT_ID} \\`, SESSION, ACCOUNT)],
  }),
  responses: {
    200: jsonResponse("The ID of the deleted project.", envelope(ProjectDeletedSchema)),
    ...errorResponses(400, 401, 403, 404),
  },
});

export const moveRepoProjectDoc = describeRoute({
  tags: ["repos"],
  security: SERVICE_SECURITY,
  summary: "Move a repo into, between or out of projects",
  description: routeText({
    context:
      "A Repo is in at most one Project. `projectId` names the Project to put it in, or is `null` to take it out of every Project.",
    steps: [
      CHECK,
      "The Worker answers 404 if the Repo or the Project is not in the account, or the Repo was removed.",
      "The Worker sets the Repo's project and writes an audit row.",
    ],
    example: [
      "Put a repo in a project:",
      bash(
        `curl -X PUT ${EXAMPLE_BASE_URL}/repos/${REPO_ID}/project \\`,
        SESSION,
        ACCOUNT + " \\",
        '  -H "Content-Type: application/json" \\',
        `  -d '{"projectId":"${PROJECT_ID}"}'`,
      ),
    ],
  }),
  responses: {
    200: jsonResponse("The repo and its project.", envelope(RepoProjectSchema)),
    ...errorResponses(400, 401, 403, 404),
  },
});
