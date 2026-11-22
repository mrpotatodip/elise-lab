// The tour's scene state: which page of the dashboard is showing, and the one thing
// each page does while it is on screen.
export type Page = "scans" | "ship" | "overview" | "files" | "runners";

export type S = {
  page: Page;
  // Scans: a scan is started, finishes, and its finding opens in the side sheet.
  added: boolean;
  done: boolean;
  open: boolean;
  // Ready to ship?: "How this is decided" opens.
  decide: boolean;
  // Overview: the ring and the bars draw in once the charts are on screen.
  live: boolean;
  // Files: the type tab, which filters the rows.
  tab: "all" | "report";
  // Runners: how many computers have appeared.
  repos: number;
};

export const initial: S = { page: "scans", added: false, done: false, open: false, decide: false, live: false, tab: "all", repos: 0 };

// The still for reduced motion: the Scans page with the finding open.
export const poster: S = { ...initial, added: true, done: true, open: true };

// Each page at its payoff, for a picture of one page on its own.
const finished: S = { ...initial, added: true, done: true };
export const STILLS: Record<Page, S> = {
  scans: poster,
  ship: { ...finished, page: "ship", decide: true },
  overview: { ...finished, page: "overview", live: true },
  files: { ...finished, page: "files", tab: "report" },
  runners: { ...finished, page: "runners", repos: 3 },
};
