// -----
// "own" is for a route that answers one record of the caller's
// Account, not a list: the answer must match the caller's values,
// which differ from those the guard seeds for the other Account.
// -----
export type CrossAccountCase =
  | { kind: "run"; path: string; method?: string; body?: unknown; as?: "stranger"; expect: "not-found" | "empty" | "created" }
  | { kind: "run"; path: string; method?: string; body?: unknown; as?: "stranger"; expect: "own"; own: Record<string, number | null> }
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
export const OTHER_REPO_ID = "00000000-0000-4000-8000-0000000000b2";
export const OTHER_SECOND_REPO = "https://github.com/octocat/Spoon-Knife";
export const OTHER_RUNNER_ID = "00000000-0000-4000-8000-0000000000c1";
export const OTHER_RUNNER_NAME = "runner-of-the-other";

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
// One entry for every other route, run in this order. "run" is called as one
// Account with another Account's IDs. "pending" names the
// RLS ticket that moves the route onto the tenant role and
// replaces the entry with a "run" case. A list that names no
// ID runs as "stranger", an Account with no rows, so the list
// is empty unless it shows another Account's rows.
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
  "PUT /findings/triage": {
    kind: "run",
    path: "/findings/triage",
    method: "PUT",
    body: { repo: OTHER_REPO, fingerprint: OTHER_FINGERPRINT, status: "fixed" },
    expect: "not-found",
  },
  "GET /repos": { kind: "run", path: "/repos", as: "stranger", expect: "empty" },
  "POST /repos": { kind: "run", path: "/repos", method: "POST", body: { repo: OTHER_SECOND_REPO }, expect: "empty" },
  "GET /repos/:repoId": { kind: "run", path: `/repos/${OTHER_REPO_ID}`, expect: "not-found" },
  "GET /repos/:repoId/findings": { kind: "run", path: `/repos/${OTHER_REPO_ID}/findings`, expect: "not-found" },
  "POST /repos/:repoId/branches": { kind: "run", path: `/repos/${OTHER_REPO_ID}/branches`, method: "POST", body: { name: "release" }, expect: "not-found" },
  "GET /scans": pending(76),
  "GET /scans/:scanId": pending(76),
  "GET /scans/:scanId/diff": pending(76),
  "GET /scans/:scanId/files/:file": pending(76),
  "POST /scans": pending(82),
  "GET /files": pending(81),
  "GET /repos/:repoId/verdict": pending(81),
  "GET /usage": { kind: "run", path: "/usage", expect: "own", own: { budgetUsd: 20, spentUsd: 0, reservedUsd: 0, remainingUsd: 20, scans: 0 } },
  "GET /usage/budget/changes": { kind: "run", path: "/usage/budget/changes", expect: "empty" },
  "GET /usage/changes": { kind: "run", path: "/usage/changes", expect: "empty" },
  "GET /usage/credit": { kind: "run", path: "/usage/credit", expect: "own", own: { planKey: null, balanceUsd: 0, scans: 0 } },
  "GET /usage/credit/entries": { kind: "run", path: "/usage/credit/entries", expect: "empty" },
  "GET /usage/plan": { kind: "run", path: "/usage/plan", expect: "own", own: { plan: null, status: null, scans: 0 } },
  // -----
  // After the two change lists: the change writes the caller's own
  // audit row, which those lists would then show.
  // -----
  "PATCH /usage/budget": { kind: "run", path: "/usage/budget", method: "PATCH", body: { monthlyBudgetUsd: null }, expect: "own", own: { budgetUsd: 20, spentUsd: 0, scans: 0 } },
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
  "POST /github/connect": pending(79),
  "POST /github/installations": pending(79),
  "GET /github/installations": pending(79),
  "DELETE /github/installations/:id": pending(79),
  "GET /github/branches": pending(79),
  "GET /github/repos": pending(79),
  "GET /usage/anthropic-key": pending(79),
  "PUT /usage/anthropic-key": pending(79),
  "DELETE /usage/anthropic-key": pending(79),
  "GET /runners": { kind: "run", path: "/runners", expect: "empty" },
  "DELETE /runners/:runnerId": { kind: "run", path: `/runners/${OTHER_RUNNER_ID}`, method: "DELETE", expect: "not-found" },
  // -----
  // Adding names no other Account's ID, so "created" says it lands
  // in the caller's Account. It stays below "GET /runners": the
  // Account has a Runner of its own from here on.
  // -----
  "POST /runners": { kind: "run", path: "/runners", method: "POST", body: { name: "Guard laptop" }, expect: "created" },
} satisfies Record<string, CrossAccountCase>;
