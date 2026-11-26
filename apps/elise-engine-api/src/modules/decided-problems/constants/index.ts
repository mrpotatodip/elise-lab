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
