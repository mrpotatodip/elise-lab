import type { CliAccessGrantableScope } from "@repo/contracts/elise";

export type NewRunner = {
  tenantId: string;
  actorUserId: string;
  name: string;
  codeHash: string;
  expiresAt: Date;
};

export type NewRunnerJob = {
  scanId: string;
  tenantId: string;
  runnerId: string;
  repoUrl: string;
  ref: string | null;
  prompt: string;
  optionsJson: string;
  priorsJson: string;
  resumesScanId: string | null;
};

export type JobReport = {
  scanId: string;
  runnerId: string;
  state: "succeeded" | "failed";
  error: string | null;
  commitSha: string | null;
  branch: string | null;
  usageJson: string | null;
  filesJson: string | null;
  now: Date;
};

export type PairingClaim = {
  codeHash: string;
  tokenHash: string;
  now: Date;
};

export type NewRunnerLogin = {
  userCodeHash: string;
  deviceCodeHash: string;
  suggestedName: string;
  os: string;
  cpu: string;
  runnerVersion: string;
  requestIp: string;
  expiresAt: Date;
};

export type RunnerLoginDenial = {
  userCodeHash: string;
  tenantId: string;
  actorUserId: string;
  approverIp: string;
  now: Date;
};

export type RunnerLoginApproval = {
  userCodeHash: string;
  tenantId: string;
  actorUserId: string;
  name: string;
  runScans: boolean;
  cliScope: CliAccessGrantableScope | null;
  approverIp: string;
  now: Date;
};
