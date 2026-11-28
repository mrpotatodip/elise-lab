import type { CliAccessScope } from "@repo/contracts/elise";

// -----
// Who a CLI access token is: the person it acts as, the one
// Account it belongs to and its scope.
// -----
export type CliAccessIdentity = {
  id: string;
  userId: string;
  accountId: string;
  scope: CliAccessScope;
};

export type NewCliAccess = {
  tenantId: string;
  personId: string;
  name: string;
  scope: CliAccessScope;
  tokenHash: string;
  approvedAt: Date;
};
