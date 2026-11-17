import type { Context } from "hono";
import { createAuth } from "#/lib/auth";
import { dbConnect, withTenant } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { holdCreditEffect, settleCreditEffect } from "#/modules/credit";
import { githubAccessFor, neonInstallationRepo } from "#/modules/github-installs";
import { userHasAccountEffect, userHasPowerEffect } from "#/modules/me";
import { activeCountsEffect, tenantScanRepo } from "#/modules/scan-ledger";
import { monthSpendEffect, monthStartOf } from "#/modules/usage";
import type { AppEnv, AppDeps } from "#/types/variables";

const sessionUserId = async (c: Context<AppEnv>): Promise<string | undefined> => {
  const { auth, close } = createAuth(c);
  try {
    return (await auth.api.getSession({ headers: c.req.raw.headers }))?.user.id;
  } finally {
    close();
  }
};

export const realAppDeps: AppDeps = {
  // -----
  // The Scan's own rows run as the Account. The global count of
  // live Scans (MAX_GLOBAL_FULL_SCANS) crosses Accounts, which a
  // withTenant transaction cannot see, so it stays on the owner role.
  // -----
  scanRepo: (env, db) => tenantScanRepo(db, (nowMs) => activeCountsEffect(dbConnect(env.DATABASE_URL), nowMs)),
  githubAccess: (env, accountId) => githubAccessFor(env, neonInstallationRepo(dbConnect(env.DATABASE_URL)), accountId),
  monthSpend: (db, accountId) => monthSpendEffect(db, accountId, monthStartOf(new Date())),
  holdCredit: (db, accountId, scanId, holdUsd) => holdCreditEffect(db, { tenantId: accountId, scanId, holdUsd }),
  releaseCredit: (db, accountId, scanId) => settleCreditEffect(db, { tenantId: accountId, scanId, chargeUsd: 0 }),
  sessionUserId,
  userHasAccount: (c, userId, accountId) => runEffect(userHasAccountEffect(dbConnect(c.env.DATABASE_URL), userId, accountId)),
  userHasPower: (c, userId, accountId, power) => runEffect(userHasPowerEffect(dbConnect(c.env.DATABASE_URL), userId, accountId, power)),
  enqueueInviteEmail: async (env, mail) => {
    await env.INVITE_EMAIL_QUEUE.send(mail, { contentType: "json" });
  },
  enqueuePasswordResetEmail: async (env, mail) => {
    await env.INVITE_EMAIL_QUEUE.send(mail, { contentType: "json" });
  },
  withTenant: (c, accountId, run) => withTenant(c.env.HYPERDRIVE_TENANT.connectionString, (promise) => c.executionCtx.waitUntil(promise), accountId, run),
};
