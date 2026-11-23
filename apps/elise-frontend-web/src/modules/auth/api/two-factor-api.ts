import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EngineError, engineFetch, jsonPost } from "#/lib/engine-client";
import { tryCatch } from "#/lib/try-catch";
import { TWO_FACTOR_REQUIRED_CODE } from "../constants";
import { clearChallenge, readChallenge } from "../server/challenge";
import { requireSession, saveSessionToken } from "../server/session";
import { BackupCodesResponseSchema, CodeSchema, DisableSchema, EnableResponseSchema, PasswordSchema } from "../schemas";
import { codeInput, secondStepFailure, type SecondStepFailure } from "../utils";

export type StepResult = { ok: true } | { ok: false; failure: SecondStepFailure };

const keepRenewedToken = (res: Response) => {
  const token = res.headers.get("set-auth-token");
  if (token) saveSessionToken(token);
};

const failureOf = (error: Error): StepResult => {
  if (!(error instanceof EngineError)) throw error;
  return { ok: false, failure: secondStepFailure(error.status, error.code) };
};

export const verifySecondStep = createServerFn({ method: "POST" })
  .validator(CodeSchema)
  .handler(async ({ data }): Promise<StepResult> => {
    const challenge = readChallenge();
    if (!challenge) return { ok: false, failure: "expired" };
    const { kind, code } = codeInput(data.code);
    const path = kind === "totp" ? "/auth/two-factor/verify-totp" : "/auth/two-factor/verify-backup-code";
    const init = { ...jsonPost(JSON.stringify({ code })), headers: { "Content-Type": "application/json", Cookie: challenge } };
    const { data: res, error } = await tryCatch(engineFetch(path, init));
    if (error) return failureOf(error);
    const token = res.headers.get("set-auth-token");
    if (!token) return { ok: false, failure: "other" };
    clearChallenge();
    saveSessionToken(token);
    return { ok: true };
  });

export const startTwoFactor = createServerFn({ method: "POST" })
  .validator(PasswordSchema)
  .handler(async ({ data }): Promise<z.infer<typeof EnableResponseSchema>> => {
    const { token } = await requireSession();
    const res = await engineFetch("/auth/two-factor/enable", jsonPost(JSON.stringify(data)), { token });
    return EnableResponseSchema.parse(await res.json());
  });

export const confirmTwoFactor = createServerFn({ method: "POST" })
  .validator(CodeSchema)
  .handler(async ({ data }): Promise<StepResult> => {
    const { token } = await requireSession();
    const { data: res, error } = await tryCatch(engineFetch("/auth/two-factor/verify-totp", jsonPost(JSON.stringify({ code: codeInput(data.code).code })), { token }));
    if (error) return failureOf(error);
    keepRenewedToken(res);
    return { ok: true };
  });

export const disableTwoFactor = createServerFn({ method: "POST" })
  .validator(DisableSchema)
  .handler(async ({ data }): Promise<{ accountRequires: boolean }> => {
    const { token } = await requireSession();
    const { data: res, error } = await tryCatch(engineFetch("/auth/two-factor/disable", jsonPost(JSON.stringify({ password: data.password, code: codeInput(data.code).code })), { token }));
    if (error instanceof EngineError && error.status === 403 && error.code === TWO_FACTOR_REQUIRED_CODE) return { accountRequires: true };
    if (error) throw error;
    keepRenewedToken(res);
    return { accountRequires: false };
  });

export const regenerateBackupCodes = createServerFn({ method: "POST" })
  .validator(PasswordSchema)
  .handler(async ({ data }): Promise<string[]> => {
    const { token } = await requireSession();
    const res = await engineFetch("/auth/two-factor/generate-backup-codes", jsonPost(JSON.stringify(data)), { token });
    keepRenewedToken(res);
    return BackupCodesResponseSchema.parse(await res.json()).backupCodes;
  });
