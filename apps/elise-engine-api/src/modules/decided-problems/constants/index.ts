// -----
// The most decided problems one hand-over lists. The worst come
// first, so a Branch with more than this keeps the ones that cost
// the hunt the most to re-report.
// -----
export const DECIDED_PROBLEMS_LIMIT = 50;

// -----
// The decisions a person makes that tell the hunt "do not report
// this again": a false positive, an accepted risk, a duplicate.
// A fixed or open problem is not among them.
// -----
export const DECIDED_PROBLEMS_STATUSES = ["false_positive", "accepted_risk", "duplicate"] as const;

// -----
// The hand-over file the hunt reads, in the output directory.
// -----
export const DECIDED_PROBLEMS_FILE = "decided-problems.json";

// -----
// The open problems of the Branch, handed to the check Phase to
// look at again (the same cap as the decided ones, worst first).
// The check writes one answer for each into OPEN_PROBLEM_CHECKS_FILE
// (#/constants). An answer never closes, reopens or decides a
// problem and never reaches the Verdict (ADR 0003, ADR 0004).
// -----
export const OPEN_PROBLEMS_LIMIT = 50;
export const OPEN_PROBLEMS_FILE = "open-problems.json";

// -----
// What the check says of a problem it was handed: it looked and
// the problem is still there, it looked and it is gone, or it did
// not reach it.
// -----
export const OPEN_PROBLEM_ANSWERS = ["still_there", "gone", "not_reached"] as const;
