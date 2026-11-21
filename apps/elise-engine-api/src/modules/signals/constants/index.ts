// -----
// What a raw probability means (ADR 0011). At or above the first a
// Signal shows; at or below the second the answer is no; the band
// between shows nothing. Starting values from TypeSafe's guidance.
// -----
export const SIGNAL_YES_THRESHOLD = 0.7;
export const SIGNAL_NO_THRESHOLD = 0.3;

// -----
// The possible-duplicate Signal (ADR 0011, ADR 0012). Each Scan
// asks at most this many pairs; the rest are counted, not asked.
// -----
export const SIGNAL_KIND_POSSIBLE_DUPLICATE = "possible_duplicate";
export const SIGNAL_DUPLICATE_PAIR_CAP = 20;
export const SIGNAL_DUPLICATE_QUESTION = "Do these two Findings, a and b, describe the same underlying problem?";
