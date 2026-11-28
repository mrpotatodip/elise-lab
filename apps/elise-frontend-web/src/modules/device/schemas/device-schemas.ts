import { z } from "zod";
import {
  ApproveRunnerLoginBodySchema,
  DenyRunnerLoginBodySchema,
  RUNNER_NAME_MAX,
  type PendingRunnerLogin,
} from "@repo/contracts/elise";

export {
  ApprovedRunnerLoginSchema,
  DeniedRunnerLoginSchema,
  PendingRunnerLoginSchema,
  RunnerLoginLookupQuerySchema,
} from "@repo/contracts/elise";
export type { PendingRunnerLogin };

export const DeviceApproveInputSchema = ApproveRunnerLoginBodySchema.extend({ accountId: z.uuid() });
export const DeviceDenyInputSchema = DenyRunnerLoginBodySchema.extend({ accountId: z.uuid() });
export type DeviceApproveInput = z.infer<typeof DeviceApproveInputSchema>;

// -----
// What the approval form checks before it asks the engine. The words say
// what to type, never the rule that failed.
// -----
export const DeviceFormSchema = z.object({
  accountId: z.string().min(1, "Choose the account this login belongs to."),
  name: z
    .string()
    .trim()
    .min(1, "Give this computer a name, like “Jayson’s MacBook”.")
    .max(RUNNER_NAME_MAX, `Use ${RUNNER_NAME_MAX} characters or fewer.`),
  runScans: z.boolean(),
  cli: z.enum(["none", "read", "start"]),
});

export type DeviceCli = "none" | "read" | "start";

export type DeviceAccount = { id: string; name: string; runScans: boolean; maxCli: DeviceCli };

export type DeviceChoices = { runScans: boolean; cli: DeviceCli };

export type DeviceLoginView = { login: PendingRunnerLogin | null; accounts: DeviceAccount[]; yourIp: string | null };
