import { z } from "zod";
import { ScanStatusSchema as ContractScanStatusSchema } from "@repo/contracts/elise";
import { documentFields } from "#/lib/document-fields";

export { ScanStateSchema } from "@repo/contracts/elise";

export const ScanStatusSchema = documentFields(ContractScanStatusSchema, {
  skill: { example: "lite" },
  model: {
    example: "claude-haiku-5-5",
    description: "The model the scan ran with. A stored scan may carry one that new scans no longer offer.",
  },
  effort: { example: "low" },
  profile: { example: "quick" },
  maxBudgetUsd: { example: 1 },
  scanId: { example: "zd3u73nfd-06ac9c07-b80c-45da-8fc5-ece4768b5b22" },
  accountId: { example: "0b8c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4" },
  repo: { example: "https://github.com/octocat/Hello-World" },
  repoId: {
    description:
      "The repo's record in this account. Every scan of the same repo shares it, however the URL was spelled.",
  },
  isPrivate: {
    description:
      "Whether the repo was private, as recorded when the scan was requested. Null on every scan since the GitHub App was retired: nothing asks GitHub.",
  },
  commitSha: {
    example: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
    description: "The commit the scan read. Null until the repo is cloned.",
  },
  ref: {
    example: "main",
    description: "The branch, tag or commit the caller asked for. Null means the default branch.",
  },
  branch: {
    example: "main",
    description: "The name of the branch the scan read, when it is known. Null for a tag, a commit or a detached HEAD.",
  },
  branchId: { description: "The tracked branch the scan belongs to. Null for a one-off scan, which has no History." },
  untrackedReason: {
    example: "the repo already tracks 25 branches",
    description: "Why a finished scan has no branch, so no History. Null when it has one.",
  },
  profileMet: {
    example: "quick",
    description:
      "The profile a succeeded Runner Scan met, from the files its agent wrote (the agent's own account of what it did): quick, standard or deep, or none when it met no profile. Equal to profile when the Scan did the work asked for, smaller when it did less. Null when the Scan was not checked: a cloud Scan, a Partial Scan, a Scan that did not succeed, or a Scan stored before this field.",
  },
  signalPairsSkipped: {
    description:
      "How many candidate pairs the possible-duplicate Signal step left unasked because of its per-Scan cap. Null when the step did not run.",
  },
  status: { example: "succeeded" },
  createdAt: { example: "2026-11-07T02:45:14.278Z" },
  files: { example: ["REPORT.md", "findings.json"] },
  step: { example: "auditing", description: "Where a running scan is. Null once it ends." },
  summary: { description: "What a finished lite scan found. Null for any other scan." },
  runner: {
    description:
      "The Runner the scan ran on, with the name its account gave it. Null for a scan that ran in EliseLAB's cloud. Its cost is the agent's estimate, never billed.",
  },
});

export type { ScanState } from "@repo/contracts/elise";
export type ScanStatus = z.infer<typeof ScanStatusSchema>;
