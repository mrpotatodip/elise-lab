import { describeRoute } from "hono-openapi";
import {
  AcceptedTeamInviteSchema,
  CreatedTeamInviteSchema,
  TeamInvitePreviewSchema,
  TeamListSchema,
  TeamRolesSchema,
  TeamTwoFactorRequirementSchema,
  TeamTwoFactorResetSchema,
} from "@repo/contracts/elise";
import { z } from "zod";
import { EXAMPLE_ACCOUNT_ID, EXAMPLE_BASE_URL, SERVICE_SECURITY, bash, envelope, errorResponses, json, jsonResponse, routeText } from "#/lib/openapi";

const SESSION = '  -H "authorization: Bearer $SESSION_TOKEN" \\';
const ACCOUNT = `  -H "x-account-id: ${EXAMPLE_ACCOUNT_ID}"`;
const INVITE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const INVITE_EXAMPLE = `{ "id": "${INVITE_ID}", "email": "bo@example.com", "role": "workspace_member", "roleLabel": "Workspace member", "groupIds": [], "expiresAt": "2026-11-15T09:00:00.000Z", "createdAt": "2026-11-08T09:00:00.000Z" }`;

export const listTeamDoc = describeRoute({
  tags: ["team"],
  security: SERVICE_SECURITY,
  summary: "List the team",
  description: routeText({
    context: "An account admin sees everyone who holds a Role in the account, and the invites that are still waiting.",
    steps: [
      "The Worker checks the session and that the login's Role in the account named by `x-account-id` holds `company:team:members:read`.",
      "The Worker reads the members with their Role and Groups.",
      "The Worker reads the invites that are not revoked, not accepted and not expired.",
    ],
    example: ["List the team:", bash(`curl ${EXAMPLE_BASE_URL}/team \\`, SESSION, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("Members and pending invites.", envelope(TeamListSchema)), ...errorResponses(400, 401, 403) },
});

export const listTeamRolesDoc = describeRoute({
  tags: ["team"],
  security: SERVICE_SECURITY,
  summary: "List the Roles an invite can give",
  description: routeText({
    context: "The invite form needs the Roles it may offer. `tenant_admin` is never on the list: an invite cannot make an admin.",
    steps: [
      "The Worker checks the session and that the login's Role in the account holds `company:team:members:read`.",
      "The Worker returns the account's enabled Roles except `tenant_admin`.",
    ],
    example: ["List the Roles:", bash(`curl ${EXAMPLE_BASE_URL}/team/roles \\`, SESSION, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The Roles.", envelope(TeamRolesSchema)), ...errorResponses(400, 401, 403) },
});

export const createTeamInviteDoc = describeRoute({
  tags: ["team"],
  security: SERVICE_SECURITY,
  summary: "Invite someone to the account",
  description: routeText({
    context:
      "An account admin invites an email address with a Role, and may put the person in Groups once they accept. The Worker queues an email with the one-time link, and the answer also holds the token, so the admin can share the link by hand if the email does not arrive.",
    steps: [
      "The Worker checks the session and that the login's Role in the account holds `company:team:invites:create`.",
      "The Worker checks the Role (not `tenant_admin`) and that every Group belongs to the account.",
      "If the email already holds a Role in the account, the answer is 409.",
      "If a pending invite for the same email exists, the Worker revokes it, so only the newest link works.",
      "The Worker saves the invite for 7 days, keeping only the hash of the token, and writes an audit row.",
      "The Worker puts the email on the invite queue. A queue failure is logged and never fails the request.",
      "The Worker returns the token once. It cannot be read again.",
    ],
    example: [
      "Invite Bo as store staff:",
      bash(`curl -X POST ${EXAMPLE_BASE_URL}/team/invites \\`, SESSION, ACCOUNT + " \\", '  -H "Content-Type: application/json" \\', `  -d '{"email":"bo@example.com","role":"workspace_member"}'`),
      json(`{ "data": { "token": "Zr0tQ1...", "invite": ${INVITE_EXAMPLE} }, "error": null }`),
    ],
  }),
  responses: { 201: jsonResponse("The invite and its one-time token.", envelope(CreatedTeamInviteSchema)), ...errorResponses(400, 401, 403, 409) },
});

export const revokeTeamInviteDoc = describeRoute({
  tags: ["team"],
  security: SERVICE_SECURITY,
  summary: "Revoke a pending invite",
  description: routeText({
    context: "An admin cancels an invite that was sent by mistake. The link stops working at once.",
    steps: [
      "The Worker checks the session and that the login's Role in the account holds `company:team:invites:delete`.",
      "The Worker marks the pending invite revoked and writes an audit row.",
      "An invite that is accepted, already revoked, expired or from another account gets 404.",
    ],
    example: ["Revoke an invite:", bash(`curl -X DELETE ${EXAMPLE_BASE_URL}/team/invites/${INVITE_ID} \\`, SESSION, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The ID of the revoked invite.", envelope(z.object({ id: z.uuid() }))), ...errorResponses(400, 401, 403, 404) },
});

export const resetTeamMemberTwoFactorDoc = describeRoute({
  tags: ["team"],
  security: SERVICE_SECURITY,
  summary: "Reset a member's Two-factor",
  description: routeText({
    context: "An admin helps a member who lost both their Authenticator and their Backup codes. The member signs in with the password and sets Two-factor up again.",
    steps: [
      "The Worker checks the session and that the login's Role in the account holds `company:team:two_factor:reset`.",
      "The Worker refuses a reset of your own Two-factor, and a reset of an admin by a `workspace_admin`, with 403.",
      "The Worker deletes the member's Authenticator secret and Backup codes, turns Two-factor off, signs the member out everywhere and writes an audit row.",
      "A party that holds no Role in the account gets 404.",
    ],
    example: ["Reset a member:", bash(`curl -X POST ${EXAMPLE_BASE_URL}/team/members/${INVITE_ID}/two-factor/reset \\`, SESSION, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The Party whose Two-factor was reset.", envelope(TeamTwoFactorResetSchema)), ...errorResponses(400, 401, 403, 404) },
});

export const getTwoFactorRequirementDoc = describeRoute({
  tags: ["team"],
  security: SERVICE_SECURITY,
  summary: "Read the Two-factor requirement",
  description: routeText({
    context: "An account admin sees whether the account requires Two-factor of every member. The Team list shows who has it.",
    steps: ["The Worker checks the session and that the login's Role in the account holds `company:team:members:read`.", "The Worker returns `required`."],
    example: ["Read it:", bash(`curl ${EXAMPLE_BASE_URL}/team/two-factor-requirement \\`, SESSION, ACCOUNT)],
  }),
  responses: { 200: jsonResponse("The requirement.", envelope(TeamTwoFactorRequirementSchema)), ...errorResponses(400, 401, 403) },
});

export const setTwoFactorRequirementDoc = describeRoute({
  tags: ["team"],
  security: SERVICE_SECURITY,
  summary: "Require Two-factor of every member, or stop",
  description: routeText({
    context:
      "With the requirement on, every member of the account who has no Two-factor is held at setup on their next request, and nobody in the account can turn their own Two-factor off. Admins are held at setup whatever this says.",
    steps: [
      "The Worker checks the session and that the login's Role in the account holds `company:team:two_factor_requirement:update`, which only a `tenant_admin` does.",
      "The Worker saves the switch and writes an audit row with the old and new value.",
      "The Worker returns the switch.",
    ],
    example: [
      "Require it:",
      bash(`curl -X PUT ${EXAMPLE_BASE_URL}/team/two-factor-requirement \\`, SESSION, `${ACCOUNT} \\`, '  -H "Content-Type: application/json" \\', `  -d '{"required":true}'`),
    ],
  }),
  responses: { 200: jsonResponse("The requirement.", envelope(TeamTwoFactorRequirementSchema)), ...errorResponses(400, 401, 403) },
});

export const previewTeamInviteDoc = describeRoute({
  tags: ["team"],
  summary: "Look at an invite link",
  description: routeText({
    context:
      "The accept page opens with the token from the link and needs to know which account it is for and whether the person must create a login or sign in. No login is needed. It never returns the invited email.",
    steps: [
      "The Worker looks the token's hash up among pending invites. An unknown, expired, revoked or used token gets one generic 403.",
      "The Worker returns the account name, the Role and `hasAccount`: true means the person signs in, false means they set a name and password.",
    ],
    example: ["Open an invite:", bash(`curl ${EXAMPLE_BASE_URL}/team/invites/$TOKEN`)],
  }),
  responses: { 200: jsonResponse("What the invite is for.", envelope(TeamInvitePreviewSchema)), ...errorResponses(403) },
});

export const acceptTeamInviteDoc = describeRoute({
  tags: ["team"],
  summary: "Accept an invite",
  description: routeText({
    context:
      "The invited person joins the account. A person with no login sends a name and a password. A person who already has a login signs in first and sends the session, with no body.",
    steps: [
      "The Worker marks the invite accepted, but only if it is still pending, so a link works once.",
      "It checks the Role is still enabled and not `tenant_admin`.",
      "With no login for the invited email, it makes the Person, the login and the credential. With one, the session must be that login.",
      "It gives the Role, adds the person to the invite's Groups and writes an audit row. If any step fails, nothing is saved and the invite stays usable.",
    ],
    example: [
      "A new person accepts:",
      bash(`curl -X POST ${EXAMPLE_BASE_URL}/team/invites/$TOKEN/accept \\`, '  -H "Content-Type: application/json" \\', `  -d '{"firstName":"Bo","lastName":"Chen","password":"correct-horse-battery"}'`),
      json(`{ "data": { "tenantId": "${EXAMPLE_ACCOUNT_ID}" }, "error": null }`),
    ],
  }),
  responses: { 200: jsonResponse("The account the person joined.", envelope(AcceptedTeamInviteSchema)), ...errorResponses(400, 403, 409) },
});
