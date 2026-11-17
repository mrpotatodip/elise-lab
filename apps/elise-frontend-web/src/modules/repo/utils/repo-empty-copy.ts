export type FindingFilter = "action" | "decided" | "scan" | "all";

type EmptyCopy = { title: string; text: string };

const NO_SCAN_CLOSES = "No scan closes a problem: only a person does, by marking it fixed, dismissed or accepted.";

// -----
// "Nothing needs action" is a claim about the branch, so it is made only
// when no problem is open. A scan never closes a problem, so the list can
// be empty while a count says otherwise (a search, a page not loaded yet):
// then the page says why a problem stays open and does not say it is fixed.
// -----
export function repoEmptyCopy(filter: FindingFilter, openTotal: number): EmptyCopy {
  switch (filter) {
    case "action":
      return openTotal === 0
        ? { title: "Nothing needs action", text: "No problem is open on this branch. That is not proof the code is safe: a scan does not find every problem." }
        : { title: "Open problems are not listed here", text: `${NO_SCAN_CLOSES} Show every finding to see them.` };
    case "decided":
      return { title: "No one has decided anything yet", text: "When someone marks a finding fixed, dismisses it or accepts the risk, it appears here." };
    case "scan":
      return { title: "No scan has closed a problem", text: "A scan never closes a problem. Only a person does, once the code is fixed." };
    case "all":
      return { title: "No findings", text: "Run a scan to check this repository." };
  }
}
