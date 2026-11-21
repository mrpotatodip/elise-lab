export type GettingStartedFlag = "git-skipped";

export const gettingStartedFlagKey = (accountId: string, flag: GettingStartedFlag): string => `elise:getting-started:${accountId}:${flag}`;

export function readGettingStartedFlag(accountId: string, flag: GettingStartedFlag): boolean {
  try {
    return window.localStorage.getItem(gettingStartedFlagKey(accountId, flag)) === "1";
  } catch {
    return false;
  }
}

export function writeGettingStartedFlag(accountId: string, flag: GettingStartedFlag, value: boolean): void {
  try {
    if (value) window.localStorage.setItem(gettingStartedFlagKey(accountId, flag), "1");
    else window.localStorage.removeItem(gettingStartedFlagKey(accountId, flag));
  } catch {
    return;
  }
}
