import { Effect } from "effect";
import { hashPassword } from "better-auth/crypto";
import {
  TEAM_INVITE_TTL_MS,
  type AcceptedTeamInvite,
  type AcceptTeamInviteBody,
  type CreatedTeamInvite,
  type CreateTeamInviteBody,
  type TeamInvite,
  type TeamInvitePreview,
  type TeamList,
  type TeamRoles,
  type TeamTwoFactorReset,
  type TeamTwoFactorRequirement,
} from "@repo/contracts/elise";
import type { AppDbType, AppTxDbType, DbConnectType, PoolDbType } from "#/lib/db-connection";
import { dashboardLinkOf, enqueueEmailsQuietly, type QueuedEmail } from "#/modules/email";
import { listAdminEmailsEffect, noticeNamesEffect } from "#/modules/two-factor";
import type { TenantEffect } from "#/lib/tenant-effect";
import { ExternalError, type DbError, type Forbidden } from "#/lib/effect-query";
import { errorChainForLog } from "#/lib/redact-log";
import { generateInviteToken, hashInviteToken } from "#/modules/team/lib";
import {
  acceptInviteEffect,
  createInviteEffect,
  findTwoFactorRequirementEffect,
  inviteEmailContextEffect,
  listAssignableRolesEffect,
  listTeamEffect,
  previewInviteEffect,
  resetTwoFactorEffect,
  revokeInviteEffect,
  setTwoFactorRequirementEffect,
} from "#/modules/team/queries";
import type { InviteMailer, NoticeMailer, TeamFailure } from "#/modules/team/types";

export const listTeamSvc = (db: AppDbType, accountId: string): Effect.Effect<TeamList, DbError> => listTeamEffect(db, accountId, new Date());

export const listTeamRolesSvc = (db: AppDbType, accountId: string): Effect.Effect<TeamRoles, DbError> => listAssignableRolesEffect(db, accountId);

// -----
// Queue the email for a saved invite. The invite
// and its link already exist, so a failure here
// is logged and never fails the request: the admin
// still has the link to send by hand.
// -----
const queueInviteEmail = (tenant: TenantEffect<AppTxDbType>, accountId: string, userId: string, mailer: InviteMailer, invite: TeamInvite, token: string) =>
  Effect.gen(function* () {
    const { accountName, inviterName } = yield* tenant((db) => inviteEmailContextEffect(db, accountId, userId));
    yield* Effect.tryPromise({
      try: () =>
        mailer.enqueue({
          kind: "team-invite",
          inviteId: invite.id,
          to: invite.email,
          accountName,
          inviterName,
          roleLabel: invite.roleLabel,
          link: `${mailer.dashboardUrl.replace(/\/$/, "")}/invite/${encodeURIComponent(token)}`,
          expiresAt: invite.expiresAt,
        }),
      catch: (cause) => new ExternalError({ cause }),
    });
  }).pipe(
    Effect.catchTags({
      DbError: (error) => Effect.sync(() => console.error("Invite email not queued", errorChainForLog(error))),
      ExternalError: (error) => Effect.sync(() => console.error("Invite email not queued", errorChainForLog(error))),
    }),
  );

// -----
// The token is made here and returned once. Only
// its hash reaches the database. Once the invite
// is committed, its email is queued.
// -----
export const createInviteSvc = (
  tenant: TenantEffect<AppTxDbType>,
  accountId: string,
  userId: string,
  body: CreateTeamInviteBody,
  mailer: InviteMailer,
): Effect.Effect<CreatedTeamInvite, TeamFailure> =>
  Effect.gen(function* () {
    const token = generateInviteToken();
    const tokenHash = yield* Effect.promise(() => hashInviteToken(token));
    const now = new Date();
    const invite = yield* tenant((db) => createInviteEffect(db, {
      tenantId: accountId,
      actorUserId: userId,
      email: body.email,
      roleKey: body.role,
      groupIds: body.groupIds ?? [],
      tokenHash,
      now,
      expiresAt: new Date(now.getTime() + TEAM_INVITE_TTL_MS),
    }));
    yield* queueInviteEmail(tenant, accountId, userId, mailer, invite, token);
    return { token, invite };
  });

export const revokeInviteSvc = (db: AppTxDbType, accountId: string, userId: string, inviteId: string): Effect.Effect<{ id: string }, TeamFailure> =>
  revokeInviteEffect(db, accountId, inviteId, userId, new Date());

const sendNotices = (mailer: NoticeMailer, mails: QueuedEmail[]) => Effect.promise(() => enqueueEmailsQuietly(mailer.enqueue, mails));

const noticeContext = (db: AppDbType, accountId: string, actorUserId: string) =>
  noticeNamesEffect(db, accountId, actorUserId).pipe(
    Effect.catchTag("DbError", (error) =>
      Effect.sync(() => {
        console.error("Two-factor notice names not read", errorChainForLog(error));
        return { accountName: "your account", actorName: "An admin" };
      }),
    ),
  );

export const resetTwoFactorSvc = (
  db: PoolDbType,
  accountId: string,
  actorUserId: string,
  memberPartyId: string,
  mailer: NoticeMailer,
): Effect.Effect<TeamTwoFactorReset, TeamFailure> =>
  Effect.gen(function* () {
    const { partyId, email } = yield* resetTwoFactorEffect(db, accountId, actorUserId, memberPartyId);
    const names = yield* noticeContext(db, accountId, actorUserId);
    yield* sendNotices(mailer, [{ kind: "two-factor-reset", to: email, ...names, at: new Date().toISOString(), link: dashboardLinkOf(mailer.dashboardUrl, "/signin") }]);
    return { partyId };
  });

export const getTwoFactorRequirementSvc = (db: AppDbType, accountId: string): Effect.Effect<TeamTwoFactorRequirement, DbError> =>
  findTwoFactorRequirementEffect(db, accountId);

export const setTwoFactorRequirementSvc = (
  db: AppTxDbType,
  accountId: string,
  userId: string,
  required: boolean,
  mailer: NoticeMailer,
): Effect.Effect<TeamTwoFactorRequirement, DbError> =>
  Effect.gen(function* () {
    const { changed, ...saved } = yield* setTwoFactorRequirementEffect(db, accountId, userId, required);
    if (!changed) return saved;
    const names = yield* noticeContext(db, accountId, userId);
    const admins = yield* listAdminEmailsEffect(db, accountId).pipe(
      Effect.catchTag("DbError", (error) =>
        Effect.sync(() => {
          console.error("Two-factor notice recipients not read", errorChainForLog(error));
          return [];
        }),
      ),
    );
    const at = new Date().toISOString();
    const link = dashboardLinkOf(mailer.dashboardUrl, "/team");
    yield* sendNotices(mailer, admins.map((to) => ({ kind: "two-factor-requirement-changed", to, ...names, required: saved.required, at, link })));
    return saved;
  });

export const previewInviteSvc = (db: DbConnectType, token: string): Effect.Effect<TeamInvitePreview, Forbidden | DbError> =>
  Effect.gen(function* () {
    const tokenHash = yield* Effect.promise(() => hashInviteToken(token));
    return yield* previewInviteEffect(db, tokenHash, new Date());
  });

// -----
// A new login needs all three of name, last name
// and password; an existing one sends none and
// signs in instead.
// -----
export const acceptInviteSvc = (
  db: PoolDbType,
  token: string,
  body: AcceptTeamInviteBody,
  signedInUserId: string | undefined,
): Effect.Effect<AcceptedTeamInvite, TeamFailure> =>
  Effect.gen(function* () {
    const tokenHash = yield* Effect.promise(() => hashInviteToken(token));
    const { firstName, lastName, password } = body;
    const newLogin =
      firstName && lastName && password ? { firstName, lastName, passwordHash: yield* Effect.promise(() => hashPassword(password)) } : undefined;
    return yield* acceptInviteEffect(db, { tokenHash, now: new Date(), signedInUserId, newLogin });
  });
