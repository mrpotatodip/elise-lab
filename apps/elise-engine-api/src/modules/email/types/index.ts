// -----
// One Team invite email, as it waits in the queue.
// The link holds the one-time token, because only the
// hash of the token is stored.
// -----
export type TeamInviteEmail = {
  kind: "team-invite";
  to: string;
  accountName: string;
  inviterName: string;
  roleLabel: string;
  link: string;
  expiresAt: string;
};

// -----
// One password reset email. The link holds the
// one-time token.
// -----
export type PasswordResetEmail = {
  kind: "password-reset";
  to: string;
  link: string;
  expiresAt: string;
};

// -----
// A Security notice about a Runner. It carries IDs: the
// consumer loads the Runner's name and the actor at send
// time. `at` is when the change committed.
// -----
export type RunnerNoticeEmail = {
  kind: "runner-added" | "runner-removed";
  to: string;
  accountId: string;
  runnerId: string;
  actorUserId: string;
  at: string;
  link: string;
};

export type RunnerNames = { runnerName: string; actorName: string; accountName: string };

// -----
// What the email queue carries: one member for each
// email, told apart by `kind`. A kind with no
// template does not compile (render-email.ts).
// -----
export type QueuedEmail = TeamInviteEmail | PasswordResetEmail | RunnerNoticeEmail;

// -----
// The shape queued before `kind` existed: always a
// Team invite. The consumer still reads it for one
// release.
// -----
export type LegacyInviteEmail = Omit<TeamInviteEmail, "kind">;

export type QueueBody = QueuedEmail | LegacyInviteEmail;

export type RetryRule = "backoff" | "long-wait" | "drop";
