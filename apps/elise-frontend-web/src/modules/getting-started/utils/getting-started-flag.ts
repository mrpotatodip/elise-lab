export type GettingStartedFlag = "git-skipped" | "dismissed";

export const gettingStartedFlagKey = (accountId: string, flag: GettingStartedFlag): string =>
  `elise:getting-started:${accountId}:${flag}`;
