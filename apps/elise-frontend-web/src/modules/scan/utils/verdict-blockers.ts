import type { Verdict } from "../schemas";

// -----
// Which open problems stand between a commit and a pass. It follows the
// engine's rule: a problem not yet validated always blocks, a critical or a
// high one blocks while there are more than the limit allows, a medium one
// only when there are more than the limit (3), and a low or informational
// one never does. Accepted and dismissed problems are not in the open list.
// -----
export function verdictBlockers(verdict: Verdict): Set<string> {
  const { counts, limits } = verdict;
  const blocks = (severity: Verdict["open"][number]["severity"]) =>
    severity === null || (severity === "critical" && counts.critical > limits.critical) || (severity === "high" && counts.high > limits.high) || (severity === "medium" && counts.medium > limits.medium);
  return new Set(verdict.open.filter((finding) => blocks(finding.severity)).map((finding) => finding.fingerprint));
}

// -----
// One sentence on how many of the open problems block the commit, so the
// count above the list and the marks on its rows say the same thing.
// -----
export function openProblemsSummary(open: number, blocking: number): string {
  if (open > 0 && blocking === open) return open === 1 ? "It blocks shipping." : "All of them block shipping.";
  if (blocking === 0) return open === 1 ? "It does not block shipping on its own." : "None of them blocks shipping on its own.";
  return `${blocking} of them ${blocking === 1 ? "blocks" : "block"} shipping, marked in the list below. The rest are within the limits.`;
}
