import type { DECIDED_PROBLEMS_STATUSES } from "#/modules/decided-problems/constants";

// -----
// One entry of the hand-over: only what the hunt needs to
// recognise the problem. A decision's note is never in it.
// -----
export type DecidedProblem = {
  fingerprint: string;
  title: string;
  class: string;
  file: string | null;
  status: (typeof DECIDED_PROBLEMS_STATUSES)[number];
};
