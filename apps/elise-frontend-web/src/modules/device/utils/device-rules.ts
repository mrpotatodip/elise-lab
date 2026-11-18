import { hasAccessPower, type MeAccount } from "@repo/contracts/elise";
import { DEVICE_RUNNER_POWER } from "../constants";
import type { DeviceAccount } from "../schemas";

// -----
// The Accounts the person may add a Runner to: only those where their Role
// holds the Power. An engine that sends no powers lists nothing, so the page
// never offers an Account the engine would refuse.
// -----
export const runnerAccounts = (accounts: readonly MeAccount[]): DeviceAccount[] =>
  accounts.filter((account) => hasAccessPower(account.powers ?? [], DEVICE_RUNNER_POWER)).map(({ id, name }) => ({ id, name }));

// -----
// One Account is chosen for the person. With several, the person picks:
// approving into the wrong one is worth one deliberate click.
// -----
export const preselectedAccountId = (accounts: readonly DeviceAccount[]): string => (accounts.length === 1 ? (accounts[0]?.id ?? "") : "");

// -----
// The flag shows only when both IPs are known and differ. A request with
// no readable IP of the person's own flags nothing.
// -----
export const ipDiffers = (requestIp: string, yourIp: string | null): boolean => yourIp !== null && yourIp !== "" && yourIp !== requestIp;

export const displayCode = (code: string): string => code.trim().toUpperCase();
