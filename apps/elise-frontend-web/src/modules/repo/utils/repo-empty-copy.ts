export type FindingFilter = "action" | "decided" | "scan" | "all";

type EmptyCopy = { title: string; text: string };

// -----
// The text reads only the list the page holds, never a count from another
// query: a decision changes the list at once, and a count catches up later.
// While pages are not loaded, an empty filter proves nothing about the
// branch, so the page says to load more. Once every page is loaded, an empty
// "Needs action" list means no problem is open.
// -----
export function repoEmptyCopy(filter: FindingFilter, hasMore: boolean): EmptyCopy {
  if (hasMore && filter !== "all") {
    return { title: "None in the findings loaded so far", text: "Some findings are not loaded yet. Load more findings to check them." };
  }
  switch (filter) {
    case "action":
      return { title: "Nothing needs action", text: "No problem is open on this branch. That is not proof the code is safe: a scan does not find every problem." };
    case "decided":
      return { title: "No one has decided anything yet", text: "When someone marks a finding fixed, dismisses it or accepts the risk, it appears here." };
    case "scan":
      return { title: "No scan has closed a problem", text: "Scans do not close problems now: a person does, once the code is fixed. Only earlier scans closed some, and none of those is on this branch." };
    case "all":
      return { title: "No findings", text: "Run a scan to check this repository." };
  }
}
