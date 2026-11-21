import type { Runner, ScanStatus } from "@repo/contracts/elise";

export const GETTING_STARTED_TASK_KEYS = ["install", "login", "git-access", "first-scan", "report"] as const;
export type GettingStartedTaskKey = (typeof GETTING_STARTED_TASK_KEYS)[number];

export type GettingStartedInput = {
  runners: readonly Pick<Runner, "pairedAt">[];
  scans: readonly Pick<ScanStatus, "status" | "files" | "artifacts">[];
  gitSkipped: boolean;
};

export type GettingStartedResult = {
  tasks: readonly { key: GettingStartedTaskKey; done: boolean }[];
  show: boolean;
};

const REPORT_FILE = "REPORT.md";

const hasReport = (scan: GettingStartedInput["scans"][number]): boolean =>
  scan.status === "succeeded" && ((scan.files ?? []).includes(REPORT_FILE) || (scan.artifacts ?? []).some((artifact) => artifact.name === REPORT_FILE));

export function gettingStarted({ runners, scans, gitSkipped }: GettingStartedInput): GettingStartedResult {
  const paired = runners.some((runner) => runner.pairedAt !== null);
  const reported = scans.some(hasReport);
  const done = {
    install: paired,
    login: paired,
    "git-access": gitSkipped,
    "first-scan": scans.length > 0,
    report: reported,
  } satisfies Record<GettingStartedTaskKey, boolean>;
  return { tasks: GETTING_STARTED_TASK_KEYS.map((key) => ({ key, done: done[key] })), show: !reported };
}
