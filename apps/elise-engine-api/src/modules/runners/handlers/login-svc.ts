import { Effect } from "effect";
import {
  RUNNER_LOGIN_TTL_MS,
  type ApprovedRunnerLogin,
  type ApproveRunnerLoginBody,
  type CheckRunnerLoginBody,
  type DeniedRunnerLogin,
  type DenyRunnerLoginBody,
  type PendingRunnerLogin,
  type RunnerLoginCheck,
  type StartedRunnerLogin,
  type StartRunnerLoginBody,
} from "@repo/contracts/elise";
import type { AppDbType, DbConnectType } from "#/lib/db-connection";
import { generateCliAccessToken, hashCliAccessToken } from "#/modules/cli-access";
import { Forbidden, type DbError } from "#/lib/effect-query";
import {
  RUNNER_LOGIN_CLEANUP_BATCH,
  RUNNER_LOGIN_INVALID,
  RUNNER_LOGIN_VERIFY_PATH,
} from "#/modules/runners/constants";
import {
  approveLoginEffect,
  collectLoginEffect,
  deleteExpiredLoginsEffect,
  denyLoginEffect,
  findPendingLoginEffect,
  startLoginEffect,
} from "#/modules/runners/queries";
import {
  generateDeviceCode,
  generateRunnerToken,
  generateUserCode,
  hashDeviceCode,
  hashPairingCode,
  hashRunnerToken,
} from "#/modules/runners/utils";

// -----
// Both codes are made here and returned once. Only their
// hashes reach the database. Each start first deletes up to 100
// expired logins: the engine has no scheduled job, and starts are
// rate limited, so the table cannot grow past what starts add.
// -----
export const startRunnerLoginSvc = (
  db: DbConnectType,
  body: StartRunnerLoginBody,
  origin: { ip: string; dashboardUrl: string },
): Effect.Effect<StartedRunnerLogin, DbError> =>
  Effect.gen(function* () {
    const userCode = generateUserCode();
    const deviceCode = generateDeviceCode();
    const [userCodeHash, deviceCodeHash] = yield* Effect.promise(() =>
      Promise.all([hashPairingCode(userCode), hashDeviceCode(deviceCode)]),
    );
    const expiresAt = new Date(Date.now() + RUNNER_LOGIN_TTL_MS);
    yield* deleteExpiredLoginsEffect(db, new Date(), RUNNER_LOGIN_CLEANUP_BATCH);
    yield* startLoginEffect(db, {
      userCodeHash,
      deviceCodeHash,
      suggestedName: body.name,
      os: body.os,
      cpu: body.cpu,
      runnerVersion: body.version,
      requestIp: origin.ip,
      expiresAt,
    });
    return {
      userCode,
      verificationUrl: `${origin.dashboardUrl}${RUNNER_LOGIN_VERIFY_PATH}?code=${userCode}`,
      deviceCode,
      expiresAt: expiresAt.toISOString(),
    };
  });

// -----
// A signed-in member reads the login their terminal started, to
// check it before approving. An unknown, expired or used code
// gets the same refusal.
// -----
export const lookupRunnerLoginSvc = (
  db: DbConnectType,
  userCode: string,
): Effect.Effect<PendingRunnerLogin, Forbidden | DbError> =>
  Effect.gen(function* () {
    const userCodeHash = yield* Effect.promise(() => hashPairingCode(userCode));
    const login = yield* findPendingLoginEffect(db, userCodeHash, new Date());
    if (!login) return yield* Effect.fail(new Forbidden({ message: RUNNER_LOGIN_INVALID }));
    return login;
  });

export const approveRunnerLoginSvc = (
  db: AppDbType,
  accountId: string,
  userId: string,
  ip: string,
  body: ApproveRunnerLoginBody,
): Effect.Effect<ApprovedRunnerLogin, Forbidden | DbError> =>
  Effect.gen(function* () {
    const userCodeHash = yield* Effect.promise(() => hashPairingCode(body.userCode));
    const approved = yield* approveLoginEffect(db, {
      userCodeHash,
      tenantId: accountId,
      actorUserId: userId,
      name: body.name,
      runScans: body.runScans,
      cliScope: body.cliScope,
      approverIp: ip,
      now: new Date(),
    });
    if (!approved) return yield* Effect.fail(new Forbidden({ message: RUNNER_LOGIN_INVALID }));
    return { approved: true as const, runnerId: approved.runnerId, cliScope: body.cliScope };
  });

export const denyRunnerLoginSvc = (
  db: AppDbType,
  accountId: string,
  userId: string,
  ip: string,
  body: DenyRunnerLoginBody,
): Effect.Effect<DeniedRunnerLogin, Forbidden | DbError> =>
  Effect.gen(function* () {
    const userCodeHash = yield* Effect.promise(() => hashPairingCode(body.userCode));
    const denied = yield* denyLoginEffect(db, {
      userCodeHash,
      tenantId: accountId,
      actorUserId: userId,
      approverIp: ip,
      now: new Date(),
    });
    if (!denied) return yield* Effect.fail(new Forbidden({ message: RUNNER_LOGIN_INVALID }));
    return { denied: true as const };
  });

// -----
// While pending the answer is "keep waiting". The first check
// after approval makes the token and returns it once; a device
// code that matches nothing gets the same refusal whatever the
// reason. A denied, expired or too-early check says so.
// -----
export const checkRunnerLoginSvc = (
  db: DbConnectType,
  body: CheckRunnerLoginBody,
): Effect.Effect<RunnerLoginCheck, Forbidden | DbError> =>
  Effect.gen(function* () {
    const runnerToken = generateRunnerToken();
    const cliAccessToken = generateCliAccessToken();
    const [deviceCodeHash, runnerTokenHash, cliAccessTokenHash] = yield* Effect.promise(() =>
      Promise.all([hashDeviceCode(body.deviceCode), hashRunnerToken(runnerToken), hashCliAccessToken(cliAccessToken)]),
    );
    const result = yield* collectLoginEffect(db, deviceCodeHash, { runnerTokenHash, cliAccessTokenHash }, new Date());
    if (result.kind === "missing") return yield* Effect.fail(new Forbidden({ message: RUNNER_LOGIN_INVALID }));
    if (result.kind === "pending") return { status: "pending" as const };
    if (result.kind === "denied") return { status: "denied" as const };
    if (result.kind === "expired") return { status: "expired" as const };
    if (result.kind === "slow_down") return { status: "slow_down" as const, interval: result.interval };
    return {
      status: "approved" as const,
      accountId: result.accountId,
      accountName: result.accountName,
      runnerId: result.runner?.runnerId,
      name: result.runner?.name,
      token: result.runner ? runnerToken : undefined,
      cliAccess: result.cliAccess ? { ...result.cliAccess, token: cliAccessToken } : undefined,
    };
  });
