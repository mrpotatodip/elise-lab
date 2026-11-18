import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { MeSchema } from "@repo/contracts/elise";
import { EngineError, engineJson, jsonPost } from "#/lib/engine-client";
import { requireSession } from "#/modules/auth/server/session";
import { ApprovedRunnerLoginSchema, DeviceApproveInputSchema, PendingRunnerLoginSchema, RunnerLoginLookupQuerySchema, type DeviceLoginView, type PendingRunnerLogin } from "../schemas";
import { runnerAccounts } from "../utils";

const UNUSABLE_CODE_STATUSES = new Set([400, 403, 404]);

async function lookupLogin(token: string, code: string): Promise<PendingRunnerLogin | null> {
  try {
    return await engineJson(PendingRunnerLoginSchema, `/runners/login/lookup?code=${encodeURIComponent(code)}`, {}, { token });
  } catch (error) {
    if (error instanceof EngineError && UNUSABLE_CODE_STATUSES.has(error.status)) return null;
    throw error;
  }
}

// -----
// Reads the login the terminal started, the Accounts the person may add a
// Runner to, and the IP this request came from, to compare with the login's.
// -----
export const fetchDeviceLogin = createServerFn({ method: "GET" })
  .validator(RunnerLoginLookupQuerySchema)
  .handler(async ({ data }): Promise<DeviceLoginView> => {
    const { token } = await requireSession();
    const me = await engineJson(MeSchema, "/me", {}, { token });
    return { login: await lookupLogin(token, data.code), accounts: runnerAccounts(me.accounts), yourIp: getRequestHeader("cf-connecting-ip") ?? null };
  });

// -----
// The Account is the person's choice among their own, so it is checked
// against /me here; the engine checks the Power again for that Account.
// -----
export const approveDeviceLogin = createServerFn({ method: "POST" })
  .validator(DeviceApproveInputSchema)
  .handler(async ({ data }) => {
    const { token } = await requireSession();
    const me = await engineJson(MeSchema, "/me", {}, { token });
    if (!runnerAccounts(me.accounts).some((account) => account.id === data.accountId)) throw new Error("You can't add a Runner to this account.");
    const body = JSON.stringify({ userCode: data.userCode, name: data.name });
    return engineJson(ApprovedRunnerLoginSchema, "/runners/login/approve", jsonPost(body), { token, accountId: data.accountId });
  });
