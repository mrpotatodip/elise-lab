// -----
// "own" is for a route that answers one record of the caller's
// Account, not a list: the answer must match the caller's values,
// which differ from those the guard seeds for the other Account.
// -----
export type CrossAccountCase =
  | { kind: "run"; path: string; method?: string; body?: unknown; expect: "not-found" | "empty" }
  | { kind: "run"; path: string; method?: string; body?: unknown; expect: "own"; own: Record<string, number | null> }
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
  "POST /runners": pending(80),
  "GET /runners": pending(80),
  "DELETE /runners/:runnerId": pending(80),
} satisfies Record<string, CrossAccountCase>;
