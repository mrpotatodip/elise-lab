// -----
// Messages. A refused invite always reads the
// same, so a guesser learns nothing from it.
// -----
export const TEAM_INVITE_INVALID = "This invite is invalid or has expired";
export const TEAM_INVITE_SIGN_IN_REQUIRED = "Sign in with the invited email to accept this invite";
export const TEAM_INVITE_DETAILS_REQUIRED = "firstName, lastName and password are required to accept this invite";
export const TEAM_ROLE_UNKNOWN = "Unknown role";
export const TEAM_GROUP_UNKNOWN = "Unknown group";
export const TEAM_ALREADY_MEMBER = "This person is already a member of the account";
export const TEAM_TOO_MANY_INVITES = "Too many pending invites. Revoke some first.";
const peopleOf = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;
export const teamPlanFullMessage = (maxMembers: number, larger: { label: string; maxMembers: number } | null) =>
  `This plan holds ${peopleOf(maxMembers)}, counting invites that are still waiting. ${larger ? `${larger.label} holds up to ${peopleOf(larger.maxMembers)}.` : "Change the plan to invite more."}`;
export const TEAM_INVITE_RACE = "Another invite for this email was just made. Try again.";
export const TEAM_INVITE_NOT_FOUND = "Invite not found";
export const TEAM_EMAIL_TAKEN = "A login with this email already exists";
export const TEAM_MEMBER_NOT_FOUND = "Member not found";
export const TEAM_RESET_SELF = "Ask another admin to reset your Two-factor";
export const TEAM_RESET_ADMIN_FORBIDDEN = "Only an owner can reset another admin's Two-factor";
export const TEAM_WORKSPACE_ADMIN_ROLE_KEY = "workspace_admin";

// -----
// Constraint names, to tell one unique clash
// from another.
// -----
export const TEAM_PENDING_EMAIL_CONSTRAINT = "uq_tenant_team_invites_pending_email";
