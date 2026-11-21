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
// Security notice: the password was changed through a
// reset. It names no one; the link opens the
// forgot-password page.
// -----
export type PasswordResetDoneEmail = {
  kind: "password-reset-done";
  to: string;
  changedAt: string;
  link: string;
};

// -----
// What the email queue carries: one member for each
// email, told apart by `kind`. A kind with no
// template does not compile (render-email.ts).
// -----
export type QueuedEmail = TeamInviteEmail | PasswordResetEmail | PasswordResetDoneEmail;

// -----
// The shape queued before `kind` existed: always a
// Team invite. The consumer still reads it for one
// release.
// -----
export type LegacyInviteEmail = Omit<TeamInviteEmail, "kind">;

export type QueueBody = QueuedEmail | LegacyInviteEmail;

export type RetryRule = "backoff" | "long-wait" | "drop";
