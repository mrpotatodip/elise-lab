export type CrossAccountCase =
  | { kind: "run"; path: string; method?: string; body?: unknown; expect: "not-found" | "empty" }
  | { kind: "own-account"; shownBy: string }
  | { kind: "pending"; ticket: number };

const pending = (ticket: number): CrossAccountCase => ({ kind: "pending", ticket });

// -----
// A write that takes no ID but the caller's own Account, so
// there is no other Account's ID to pass, and that needs the
// GitHub App or the key secret, which the guard has not got.
// The test it names shows the write stays in the caller's
// Account.
// -----
const ownAccount = (shownBy: string): CrossAccountCase => ({ kind: "own-account", shownBy });

// -----
// The repo and fingerprint of the finding the guard test
// seeds for "another" Account: the case names them as one
// Account that is not its owner.
// -----
const OTHER_REPO = "https://github.com/octocat/Hello-World";
const OTHER_FINGERPRINT = "b".repeat(64);
export const OTHER_COMMENT_ID = "00000000-0000-4000-8000-0000000000b1";
export const OTHER_INSTALL_ID = "00000000-0000-4000-8000-0000000000b2";

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
// Account with another Account's IDs. "pending" names the
// RLS ticket that moves the route onto the tenant role and
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
  "GET /team": pending(78),
  "GET /team/roles": pending(78),
  "POST /team/invites": pending(78),
  "DELETE /team/invites/:inviteId": pending(78),
  "GET /groups": pending(78),
  "POST /groups": pending(78),
  "PATCH /groups/:groupId": pending(78),
  "DELETE /groups/:groupId": pending(78),
  "PUT /groups/:groupId/members/:partyId": pending(78),
  "DELETE /groups/:groupId/members/:partyId": pending(78),
  "POST /github/connect": ownAccount("modules/github-installs/__tests__/github-installs-svc.test.ts"),
  "POST /github/installations": ownAccount("modules/github-installs/__tests__/github-installs-svc.test.ts"),
  "GET /github/installations": { kind: "run", path: "/github/installations", expect: "empty" },
  "DELETE /github/installations/:id": { kind: "run", path: `/github/installations/${OTHER_INSTALL_ID}`, method: "DELETE", expect: "not-found" },
  "GET /github/branches": { kind: "run", path: `/github/branches?installationId=${OTHER_INSTALL_ID}&repo=octo/hello`, expect: "not-found" },
  "GET /github/repos": { kind: "run", path: "/github/repos", expect: "empty" },
  "GET /usage/anthropic-key": { kind: "run", path: "/usage/anthropic-key", expect: "empty" },
  "PUT /usage/anthropic-key": ownAccount("modules/anthropic-key/__tests__/anthropic-key-svc.test.ts"),
  "DELETE /usage/anthropic-key": { kind: "run", path: "/usage/anthropic-key", method: "DELETE", expect: "empty" },
  "POST /runners": pending(80),
  "GET /runners": pending(80),
  "DELETE /runners/:runnerId": pending(80),
} satisfies Record<string, CrossAccountCase>;
