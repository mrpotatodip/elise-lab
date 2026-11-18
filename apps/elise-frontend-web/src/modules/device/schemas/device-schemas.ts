import { z } from "zod";
import { ApproveRunnerLoginBodySchema, RUNNER_NAME_MAX, type PendingRunnerLogin } from "@repo/contracts/elise";

export { ApprovedRunnerLoginSchema, PendingRunnerLoginSchema, RunnerLoginLookupQuerySchema } from "@repo/contracts/elise";
export type { PendingRunnerLogin };

export const DeviceApproveInputSchema = ApproveRunnerLoginBodySchema.extend({ accountId: z.uuid() });
export type DeviceApproveInput = z.infer<typeof DeviceApproveInputSchema>;

// -----
// What the approval form checks before it asks the engine. The words say
// what to type, never the rule that failed.
// -----
export const DeviceFormSchema = z.object({
  accountId: z.string().min(1, "Choose the account this Runner belongs to."),
  name: z.string().trim().min(1, "Give this computer a name, like “Jayson’s MacBook”.").max(RUNNER_NAME_MAX, `Use ${RUNNER_NAME_MAX} characters or fewer.`),
});

export type DeviceAccount = { id: string; name: string };

export type DeviceLoginView = { login: PendingRunnerLogin | null; accounts: DeviceAccount[]; yourIp: string | null };
