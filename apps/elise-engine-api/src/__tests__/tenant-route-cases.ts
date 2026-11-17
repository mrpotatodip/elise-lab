export type CrossAccountCase =
  | { kind: "run"; path: string; method?: string; body?: unknown; expect: "not-found" | "empty" | "refused" | "created" }
  | { kind: "pending"; ticket: number };

const pending = (ticket: number): CrossAccountCase => ({ kind: "pending", ticket });

// -----
// The repo and fingerprint of the finding the guard test
// seeds for "another" Account: the case names them as one
// Account that is not its owner.
// -----
const OTHER_REPO = "https://github.com/octocat/Hello-World";
const OTHER_FINGERPRINT = "b".repeat(64);
export const OTHER_COMMENT_ID = "00000000-0000-4000-8000-0000000000b1";
export const OTHER_GROUP_ID = "00000000-0000-4000-8000-0000000000b2";
export const OTHER_GROUP_NAME = "Backend";
export const OTHER_INVITE_ID = "00000000-0000-4000-8000-0000000000b3";
export const OTHER_PARTY_ID = "00000000-0000-4000-8000-0000000000b4";

// -----
// Routes that name no Account of their own: sign-in, the
// invite link (its token is the credential), the Runner's
// own token routes, and the developer docs.
// -----
export const NOT_TENANT_ROUTES: readonly string[] = [
  "GET /auth/*",
  "POST /auth/*",
  "POST /sign-up",
  "GET /me",
  "GET /team/invites/:token",
  "POST /team/invites/:token/accept",
  "POST /runners/enroll",
  "POST /runners/claim",
  "POST /runners/jobs/:scanId/result",
  "GET /runners/me",
  "DELETE /runners/me",
  "GET /openapi.json",
  "GET /docs",
];

// -----
// One entry for every other route. "run" is called as one
// Account with another Account's IDs: "not-found" answers 404,
// "empty" 200 with no list entries, "refused" 400 (a body that
// names another Account's row), and "created" 201 for a write
// that lands in the caller's Account only (a name another
// Account already uses is free here). "pending" names the RLS
// ticket that moves the route onto the tenant role and
// replaces the entry with a "run" case.
// -----
export const CROSS_ACCOUNT_CASES = {
  "GET /findings": { kind: "run", path: "/findings?scanId=theirs", expect: "empty" },
  "GET /findings/comments": { kind: "run", path: `/findings/comments?repo=${OTHER_REPO}&fingerprint=${OTHER_FINGERPRINT}`, expect: "empty" },
  "POST /findings/comments": {
    kind: "run",
    path: "/findings/comments",
    method: "POST",
    body: { repo: OTHER_REPO, fingerprint: OTHER_FINGERPRINT, body: "Not mine to write" },
    expect: "not-found",
  },
  "DELETE /findings/comments/:commentId": { kind: "run", path: `/findings/comments/${OTHER_COMMENT_ID}`, method: "DELETE", expect: "not-found" },
  "PATCH /findings/comments/:commentId": {
    kind: "run",
    path: `/findings/comments/${OTHER_COMMENT_ID}`,
    method: "PATCH",
    body: { body: "Not mine to edit" },
    expect: "not-found",
  },
  "PUT /findings/triage": pending(74),
  "GET /repos": pending(75),
  "POST /repos": pending(75),
  "GET /repos/:repoId": pending(75),
  "GET /repos/:repoId/findings": pending(75),
  "POST /repos/:repoId/branches": pending(75),
  "GET /scans": pending(76),
  "GET /scans/:scanId": pending(76),
  "GET /scans/:scanId/diff": pending(76),
  "GET /scans/:scanId/files/:file": pending(76),
  "POST /scans": pending(82),
  "GET /files": pending(81),
  "GET /repos/:repoId/verdict": pending(81),
  "GET /usage": pending(77),
  "PATCH /usage/budget": pending(77),
  "GET /usage/budget/changes": pending(77),
  "GET /usage/changes": pending(77),
  "GET /usage/credit": pending(77),
  "GET /usage/credit/entries": pending(77),
  "GET /usage/plan": pending(77),
  "GET /team": { kind: "run", path: "/team", expect: "empty" },
  "GET /team/roles": { kind: "run", path: "/team/roles", expect: "empty" },
  "POST /team/invites": {
    kind: "run",
    path: "/team/invites",
    method: "POST",
    body: { email: "new@example.com", role: "workspace_member", groupIds: [OTHER_GROUP_ID] },
    expect: "refused",
  },
  "DELETE /team/invites/:inviteId": { kind: "run", path: `/team/invites/${OTHER_INVITE_ID}`, method: "DELETE", expect: "not-found" },
  "GET /groups": { kind: "run", path: "/groups", expect: "empty" },
  "POST /groups": { kind: "run", path: "/groups", method: "POST", body: { name: OTHER_GROUP_NAME }, expect: "created" },
  "PATCH /groups/:groupId": { kind: "run", path: `/groups/${OTHER_GROUP_ID}`, method: "PATCH", body: { name: "Not mine to rename" }, expect: "not-found" },
  "DELETE /groups/:groupId": { kind: "run", path: `/groups/${OTHER_GROUP_ID}`, method: "DELETE", expect: "not-found" },
  "PUT /groups/:groupId/members/:partyId": { kind: "run", path: `/groups/${OTHER_GROUP_ID}/members/${OTHER_PARTY_ID}`, method: "PUT", expect: "not-found" },
  "DELETE /groups/:groupId/members/:partyId": { kind: "run", path: `/groups/${OTHER_GROUP_ID}/members/${OTHER_PARTY_ID}`, method: "DELETE", expect: "not-found" },
  "POST /github/connect": pending(79),
  "POST /github/installations": pending(79),
  "GET /github/installations": pending(79),
  "DELETE /github/installations/:id": pending(79),
  "GET /github/branches": pending(79),
  "GET /github/repos": pending(79),
  "GET /usage/anthropic-key": pending(79),
  "PUT /usage/anthropic-key": pending(79),
  "DELETE /usage/anthropic-key": pending(79),
  "POST /runners": pending(80),
  "GET /runners": pending(80),
  "DELETE /runners/:runnerId": pending(80),
} satisfies Record<string, CrossAccountCase>;
