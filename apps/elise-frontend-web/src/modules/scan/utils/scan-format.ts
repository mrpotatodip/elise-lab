import type { ScanFailureCodeValue } from "@repo/contracts/elise";

const BYTE_UNITS =["B", "KB", "MB", "GB"] as const;

export function scanBytes(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

export function scanDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export const scanCost = (usd: number) => (usd > 0 && usd < 0.01 ? "< $0.01" : `$${usd.toFixed(2)}`);

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export const scanTokens = (count: number) => COMPACT.format(count);

export const scanPlural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const scanNoSummaryText = (status: string) => {
  if (status === "succeeded") return "Not recorded";
  if (status === "queued" || status === "running") return "Not ready yet";
  return "No report";
};

export const verdictScansToRun = (missingWeight: number) => Math.ceil(missingWeight);

// -----
// The copy for each failure code the engine sends (`failureCode` on a
// scan). The code says why; the words of the error are never read here.
// A repository that does not exist and one that is private look the same
// to GitHub, so repo_unreadable names both.
// -----
const FAILURE_CAUSES = {
  out_of_memory: { title: "The agent ran out of memory while it read the repository.", advice: "Start a new scan with Claude Haiku 5.5 and low effort, or scan a smaller repository." },
  plan_usage_limit: {
    title: "Your Claude plan is out of usage.",
    advice: "The details show when it resets. Start the scan again after that. Spend from the phases that already ran is not refunded.",
  },
  ref_not_found: { title: "That branch, tag or commit was not found in the repository.", advice: "Check the name, or start a scan of the default branch." },
  clone_timeout: { title: "Cloning the repository took too long and was stopped.", advice: "The repository may be too large. Try a smaller repository or a specific branch." },
  repo_unreadable: {
    title: "Elise could not read this repository.",
    advice: "Check that the link is correct. If the repository is private, make sure this computer's git login can read it: run `elise-runner doctor`.",
  },
  clone_failed: { title: "The repository could not be cloned.", advice: "Check the link. If the repository is private, run `elise-runner doctor` to check this computer's git login." },
  no_report: {
    title: "The agent stopped before it wrote the report.",
    advice: "Open the details to read the agent's last words. If it names a permission, check that the agent can write its output folder, then start a new scan.",
  },
  budget_spent: { title: "The scan reached its spend limit before it finished.", advice: "Start a new scan with a lower effort, or check the monthly budget on the Overview page." },
  timed_out: { title: "The scan took too long and was stopped.", advice: "Start a new scan. If it keeps timing out, try a smaller repository." },
} satisfies Record<ScanFailureCodeValue, { title: string; advice: string }>;

const DETAIL_LIMIT = 800;

// -----
// A failed scan keeps the agent's raw error, which can be a wall of minified
// code. The reviewer gets a short cause and what to do; the raw text stays
// behind a toggle, cut to a length a person can scroll.
// -----
export function scanFailure(error: string | null | undefined, failureCode?: ScanFailureCodeValue | null) {
  const raw = (error ?? "").trim();
  const cause = failureCode ? FAILURE_CAUSES[failureCode] : undefined;
  const firstLine = raw.split("\n")[0]?.slice(0, 160) ?? "";
  return {
    title: cause?.title ?? (firstLine === "" ? "The scan failed." : firstLine),
    advice: cause?.advice ?? "Start a new scan of this repository to try again. If it fails the same way, check the link, and run `elise-runner doctor` if the repository is private.",
    detail: raw === "" ? null : raw.length > DETAIL_LIMIT ? `${raw.slice(0, DETAIL_LIMIT)}\n... (${raw.length - DETAIL_LIMIT} more characters)` : raw,
  };
}
