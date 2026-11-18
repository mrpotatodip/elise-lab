import { Effect } from "effect";
import {
  RUNNER_LOGIN_TTL_MS,
  type ApprovedRunnerLogin,
  type ApproveRunnerLoginBody,
  type CheckRunnerLoginBody,
  type RunnerLoginCheck,
  type StartedRunnerLogin,
  type StartRunnerLoginBody,
} from "@repo/contracts/elise";
import type { AppDbType, DbConnectType } from "#/lib/db-connection";
import { Forbidden, type DbError } from "#/lib/effect-query";
import { RUNNER_LOGIN_INVALID, RUNNER_LOGIN_VERIFY_PATH } from "#/modules/runners/constants";
import { approveLoginEffect, collectLoginEffect, startLoginEffect } from "#/modules/runners/queries";
import { generateDeviceCode, generateRunnerToken, generateUserCode, hashDeviceCode, hashPairingCode, hashRunnerToken } from "#/modules/runners/utils";

// -----
// Both codes are made here and returned once. Only their
// hashes reach the database.
// -----
export const startRunnerLoginSvc = (db: DbConnectType, body: StartRunnerLoginBody, origin: { ip: string; dashboardUrl: string }): Effect.Effect<StartedRunnerLogin, DbError> =>
  Effect.gen(function* () {
    const userCode = generateUserCode();
    const deviceCode = generateDeviceCode();
    const [userCodeHash, deviceCodeHash] = yield* Effect.promise(() => Promise.all([hashPairingCode(userCode), hashDeviceCode(deviceCode)]));
    const expiresAt = new Date(Date.now() + RUNNER_LOGIN_TTL_MS);
    yield* startLoginEffect(db, { userCodeHash, deviceCodeHash, suggestedName: body.name, os: body.os, cpu: body.cpu, runnerVersion: body.version, requestIp: origin.ip, expiresAt });
    return { userCode, verificationUrl: `${origin.dashboardUrl}${RUNNER_LOGIN_VERIFY_PATH}?code=${userCode}`, deviceCode, expiresAt: expiresAt.toISOString() };
  });

export const approveRunnerLoginSvc = (db: AppDbType, accountId: string, userId: string, ip: string, body: ApproveRunnerLoginBody): Effect.Effect<ApprovedRunnerLogin, Forbidden | DbError> =>
  Effect.gen(function* () {
    const userCodeHash = yield* Effect.promise(() => hashPairingCode(body.userCode));
    const approved = yield* approveLoginEffect(db, { userCodeHash, tenantId: accountId, actorUserId: userId, name: body.name, approverIp: ip, now: new Date() });
    if (!approved) return yield* Effect.fail(new Forbidden({ message: RUNNER_LOGIN_INVALID }));
    return { approved: true as const, runnerId: approved.runnerId };
  });

// -----
// While pending the answer is "keep waiting". The first check
// after approval makes the token and returns it once; a device
// code that matches nothing live gets the same refusal whatever
// the reason.
// -----
export const checkRunnerLoginSvc = (db: DbConnectType, body: CheckRunnerLoginBody): Effect.Effect<RunnerLoginCheck, Forbidden | DbError> =>
  Effect.gen(function* () {
    const token = generateRunnerToken();
    const [deviceCodeHash, tokenHash] = yield* Effect.promise(() => Promise.all([hashDeviceCode(body.deviceCode), hashRunnerToken(token)]));
    const result = yield* collectLoginEffect(db, deviceCodeHash, tokenHash, new Date());
    if (result.kind === "missing") return yield* Effect.fail(new Forbidden({ message: RUNNER_LOGIN_INVALID }));
    if (result.kind === "pending") return { status: "pending" as const };
    return { status: "approved" as const, ...result.identity, token };
  });
