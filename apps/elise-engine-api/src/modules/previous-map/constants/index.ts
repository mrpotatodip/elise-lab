// -----
// The hand-over file recon reads, in the output directory: the
// architecture map and the coverage ledger of the last Scan on the
// Branch. It is not named architecture.md or coverage-ledger.json
// on purpose: the Phases after recon read those two names and expect
// this Scan's own, with every unit still planned.
// -----
export const PREVIOUS_MAP_FILE = "previous-map.json";

// -----
// The files of a Scan the next one reads.
// -----
export const PREVIOUS_MAP_ARCHITECTURE_FILE = "architecture.md";
export const PREVIOUS_MAP_LEDGER_FILE = "coverage-ledger.json";
