import { hasAccessPower, type MeAccount } from "@repo/contracts/elise";
import { DEVICE_DASHBOARD_POWER, DEVICE_RUNNER_POWER, DEVICE_SUMMARY_POWER } from "../constants";
import type { DeviceAccount, DeviceChoices } from "../schemas";

const maxCliOf = (powers: readonly string[]): DeviceAccount["maxCli"] => {
  if (hasAccessPower(powers, DEVICE_DASHBOARD_POWER)) return "start";
  return hasAccessPower(powers, DEVICE_SUMMARY_POWER) ? "read" : "none";
};

// -----
// The Accounts the person may approve something in: where their Role holds
// the Runner Power or a read Power for the CLI. An engine that sends no
// powers lists nothing, so the page never offers what the engine refuses.
// -----
export const deviceAccounts = (accounts: readonly MeAccount[]): DeviceAccount[] =>
  accounts
    .map(({ id, name, powers }) => ({
      id,
      name,
      runScans: hasAccessPower(powers ?? [], DEVICE_RUNNER_POWER),
      maxCli: maxCliOf(powers ?? []),
    }))
    .filter((account) => account.runScans || account.maxCli !== "none");

export const clampChoices = (
  limits: Pick<DeviceAccount, "runScans" | "maxCli">,
  asked: DeviceChoices,
): DeviceChoices => ({
  runScans: asked.runScans && limits.runScans,
  cli: asked.cli === "start" && limits.maxCli === "read" ? "read" : limits.maxCli === "none" ? "none" : asked.cli,
});

export const approvalBody = (input: DeviceChoices & { userCode: string; name: string }) => ({
  userCode: input.userCode,
  name: input.name,
  runScans: input.runScans,
  cliScope: input.cli === "none" ? null : input.cli,
});

export const approvedMessage = (input: {
  name: string;
  accountName: string;
  runScans: boolean;
  cliScope: "read" | "start" | null;
}): string => {
  const { name, accountName, runScans, cliScope } = input;
  if (!cliScope) return `${name} is now a Runner of ${accountName}.`;
  if (!runScans) return `${name} can now read Scans of ${accountName} from the Elise CLI.`;
  const what = cliScope === "start" ? "start and read" : "read";
  return `${name} is now a Runner of ${accountName}, and can ${what} Scans from the Elise CLI.`;
};

// -----
// One Account is chosen for the person. With several, the person picks:
// approving into the wrong one is worth one deliberate click.
// -----
export const preselectedAccountId = (accounts: readonly DeviceAccount[]): string =>
  accounts.length === 1 ? (accounts[0]?.id ?? "") : "";

// -----
// Denying needs an Account whose Role holds the Power, because the engine
// checks it and writes the Audit trail entry there. The one the person
// picked counts if it is listed; otherwise the first listed one.
// -----
export const denyAccountId = (accounts: readonly DeviceAccount[], picked: string): string =>
  accounts.find((account) => account.id === picked)?.id ?? accounts[0]?.id ?? "";

// -----
// The flag shows only when both IPs are known and differ. A request with
// no readable IP of the person's own flags nothing.
// -----
export const ipDiffers = (requestIp: string, yourIp: string | null): boolean =>
  yourIp !== null && yourIp !== "" && yourIp !== requestIp;

export const displayCode = (code: string): string => code.trim().toUpperCase();
