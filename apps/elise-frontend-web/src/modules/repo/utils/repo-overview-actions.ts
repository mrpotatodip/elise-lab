import type { Repo } from "../schemas";
import { repoName } from "./repo-name";

export type OverviewTone = "danger" | "warning" | "info";
export type OverviewActionKey = "back" | "serious" | "check" | "stale" | "failed" | "lower" | "unscanned" | "budget";
export type OverviewRepoShare = { id: string; name: string; count: number };

export type OverviewAction = {
  key: OverviewActionKey;
  tone: OverviewTone;
  title: string;
  detail: string;
  who: string;
  where: string;
  primary: string;
  repoId: string | null;
  repos: readonly OverviewRepoShare[];
};

export type OverviewBudget = { budgetApplies?: boolean; budgetUsd: number; spentUsd: number; reservedUsd: number };

export type OverviewVerdict = { tone: "danger" | "warning" | "success"; word: string; line: string };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const short = (name: string) => name.split("/").pop() ?? name;
const BUDGET_TIGHT = 0.9;

const sharesOf = (repos: readonly Repo[], count: (repo: Repo) => number): OverviewRepoShare[] =>
  repos
    .map((repo) => ({ id: repo.id, name: repoName(repo.url), count: count(repo) }))
    .filter((share) => share.count > 0)
    .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name));

const whereOf = (shares: readonly OverviewRepoShare[]) => (shares.length === 1 ? (shares[0]?.name ?? "") : `${shares.length} repositories`);
const top = (shares: readonly OverviewRepoShare[]) => shares[0];
const sum = (shares: readonly OverviewRepoShare[]) => shares.reduce((total, share) => total + share.count, 0);
const serious = (repo: Repo) => repo.open.severity.critical + repo.open.severity.high;
const lowerRisk = (repo: Repo) => repo.open.severity.medium + repo.open.severity.low;

// -----
// What a person should do next, most urgent first, from the repository list
// alone (the counts of each default branch). A finding can count in two groups: a
// serious problem that also came back is in both, and each group states its own
// count. An empty list is the good answer. The budget joins only when the engine
// says it applies, and only when it is nearly used up.
// -----
export function overviewActions(repos: readonly Repo[], budget?: OverviewBudget): OverviewAction[] {
  const actions: OverviewAction[] = [];

  const back = sharesOf(repos, (r) => r.open.regressed);
  if (back.length > 0 && top(back)) {
    const count = sum(back);
    actions.push({
      key: "back",
      tone: "danger",
      title: `${plural(count, "fixed problem has", "fixed problems have")} come back`,
      detail: "Your team fixed this once and a later scan found it again. A recent change probably undid the fix.",
      who: "an engineer",
      where: whereOf(back),
      primary: `Review the regression in ${short(top(back)?.name ?? "")}`,
      repoId: top(back)?.id ?? null,
      repos: back,
    });
  }

  const seriousShares = sharesOf(repos, serious);
  if (seriousShares.length > 0 && top(seriousShares)) {
    const count = sum(seriousShares);
    actions.push({
      key: "serious",
      tone: "danger",
      title: `${plural(count, "serious problem is", "serious problems are")} open`,
      detail: "Critical and high problems are the ones an attacker is most likely to use. Fix them, or record why the risk is accepted, before shipping.",
      who: "an engineer",
      where: whereOf(seriousShares),
      primary: `Fix the serious ${count === 1 ? "problem" : "problems"} in ${short(top(seriousShares)?.name ?? "")}`,
      repoId: top(seriousShares)?.id ?? null,
      repos: seriousShares,
    });
  }

  const check = sharesOf(repos, (r) => r.open.needsValidation);
  if (check.length > 0 && top(check)) {
    const count = sum(check);
    actions.push({
      key: "check",
      tone: "warning",
      title: `${plural(count, "finding needs", "findings need")} a person to check`,
      detail: "The scan thinks these are real but could not prove it. Someone reads the evidence, then confirms or dismisses each one.",
      who: "a reviewer",
      where: whereOf(check),
      primary: `Review ${plural(count, "finding", "findings")} in ${short(top(check)?.name ?? "")}`,
      repoId: top(check)?.id ?? null,
      repos: check,
    });
  }

  const stale = sharesOf(repos, (r) => r.open.unchecked);
  if (stale.length > 0 && top(stale)) {
    const count = sum(stale);
    actions.push({
      key: "stale",
      tone: "warning",
      title: `${plural(count, "open finding was", "open findings were")} missed by the latest full scan`,
      detail: "The newest complete scan did not see them, so they may be out of date. Run a full scan to confirm.",
      who: "an engineer",
      where: whereOf(stale),
      primary: `Run a full scan on ${short(top(stale)?.name ?? "")}`,
      repoId: top(stale)?.id ?? null,
      repos: stale,
    });
  }

  const failed = sharesOf(repos, (r) => (r.lastScanStatus === "failed" ? 1 : 0));
  if (failed.length > 0 && top(failed)) {
    actions.push({
      key: "failed",
      tone: "warning",
      title: `The latest scan failed on ${plural(failed.length, "repository", "repositories")}`,
      detail: "A failed scan finds nothing, so these results may be out of date. Open the scan to see why, then run it again.",
      who: "an engineer",
      where: whereOf(failed),
      primary: `Retry the scan on ${short(top(failed)?.name ?? "")}`,
      repoId: top(failed)?.id ?? null,
      repos: failed,
    });
  }

  const lower = sharesOf(repos, lowerRisk);
  if (lower.length > 0 && top(lower)) {
    const count = sum(lower);
    actions.push({
      key: "lower",
      tone: "info",
      title: `${plural(count, "confirmed problem is", "confirmed problems are")} lower risk`,
      detail: "Real, but medium or low. They do not block shipping. Plan them into normal work.",
      who: "an engineer",
      where: whereOf(lower),
      primary: `See the lower-risk list in ${short(top(lower)?.name ?? "")}`,
      repoId: top(lower)?.id ?? null,
      repos: lower,
    });
  }

  const unscanned = sharesOf(repos, (r) => (r.defaultBranch === null && r.lastScanStatus !== "failed" ? 1 : 0));
  if (unscanned.length > 0 && top(unscanned)) {
    actions.push({
      key: "unscanned",
      tone: "info",
      title: `${plural(unscanned.length, "repository has", "repositories have")} not been scanned yet`,
      detail: "Nothing is known about their security. Start a first scan.",
      who: "an engineer",
      where: whereOf(unscanned),
      primary: `Scan ${short(top(unscanned)?.name ?? "")} for the first time`,
      repoId: top(unscanned)?.id ?? null,
      repos: unscanned,
    });
  }

  if (budget?.budgetApplies === true && budget.budgetUsd > 0) {
    const used = (budget.spentUsd + budget.reservedUsd) / budget.budgetUsd;
    if (used >= BUDGET_TIGHT) {
      actions.push({
        key: "budget",
        tone: used >= 1 ? "danger" : "warning",
        title: used >= 1 ? "This month's scan budget is used up" : "This month's scan budget is almost used up",
        detail: "New scans cannot start once the budget is reached. It resets on the 1st, or an admin can raise it.",
        who: "an admin",
        where: "Whole account",
        primary: "Manage budget",
        repoId: null,
        repos: [],
      });
    }
  }

  return actions;
}

export function overviewVerdict(actions: readonly OverviewAction[]): OverviewVerdict {
  const urgent = actions.filter((a) => a.tone === "danger");
  const failed = actions.find((a) => a.key === "failed");
  const parts = [
    urgent.length > 0 ? `Fix ${plural(urgent.length, "urgent item", "urgent items")} in ${urgent.every((a) => a.where === urgent[0]?.where) ? (urgent[0]?.where ?? "") : "several repositories"}.` : null,
    failed ? `The latest scan failed on ${failed.repos.map((r) => short(r.name)).join(", ")}.` : null,
  ].filter((part): part is string => part !== null);

  if (urgent.length > 0) return { tone: "danger", word: "Not ready to ship", line: parts.join(" ") };
  if (actions.some((a) => a.tone === "warning")) return { tone: "warning", word: "Almost there", line: parts.join(" ") || "Nothing is urgent, but some things need a look." };
  return { tone: "success", word: "Ready to ship", line: "Nothing needs anyone right now." };
}

export const overviewLatestScanAt = (repos: readonly Repo[]) => repos.reduce<string | null>((latest, repo) => (repo.lastScanAt !== null && (latest === null || repo.lastScanAt > latest) ? repo.lastScanAt : latest), null);
