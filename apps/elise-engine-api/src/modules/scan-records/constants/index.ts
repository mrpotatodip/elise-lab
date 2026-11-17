import type { ProfileCheckRow } from "#/modules/scan-records/types";

// -----
// Reading findings.json
// -----
export const SCAN_RECORDS_FINDINGS_FILE = "findings.json";
export const SCAN_RECORDS_RECORDED_SKILL = "lite";
// -----
// A full Scan (a profile Scan) writes the nested shape: it has no
// class of its own, and the column is required.
// -----
export const SCAN_RECORDS_PROFILE_SKILL = "full";
export const SCAN_RECORDS_FULL_CLASS = "full-audit";
export const SCAN_RECORDS_REPORT_FILE = "REPORT.md";
export const SCAN_RECORDS_LEDGER_FILE = "coverage-ledger.json";
export const SCAN_RECORDS_METADATA_FILE = "run-metadata.json";
export const SCAN_RECORDS_RECHECK_FILE = "recheck.json";
export const SCAN_RECORDS_PRIOR_FILE = "prior-findings.json";

// -----
// History: the most prior findings one scan re-checks.
// Each costs the agent tokens, so the worst come first.
// -----
export const SCAN_RECORDS_PRIOR_LIMIT = 50;

// -----
// The first line of a Report the Skill writes when its money ran
// out. Blank lines and a byte order mark before it do not matter.
// Another line that starts with PARTIAL: is the agent's own wording
// for something else and says nothing about money.
// -----
export const SCAN_RECORDS_MONEY_FIRST_LINE = "PARTIAL: money ran out;";

// -----
// Profile check: two values of the Skill's own wording that the
// engine reads. A Focused Scan's coarse subsystem identity, and the
// reason on a unit it defers on purpose.
// -----
export const SCAN_RECORDS_PROFILE_CHECK_QUICK_SUBSYSTEM = "profile/quick/all-in-scope-subsystems";
export const SCAN_RECORDS_PROFILE_CHECK_FOCUSED_DEFERRED_REASON = "quick_profile_final_critic";

// -----
// Profile check: the statuses of a unit a hunter worked on, and the
// verdicts of a record that counts as a finding. A rejected record
// is not a finding.
// -----
export const SCAN_RECORDS_PROFILE_CHECK_HUNTED_STATUSES = ["covered", "blocked", "candidate"];
export const SCAN_RECORDS_PROFILE_CHECK_FINAL_VERDICTS = ["confirmed", "needs_validation"];

// -----
// What each profile requires of a Runner Scan, read from the
// files the agent wrote. A profile requires its own rows and
// those of every smaller profile. Every row names the file
// and the field it reads; needsSkillChange is true when the
// Skill (skills/security-audit) had to start recording the
// fact, so a Scan from an app built before that change does
// not show it and fails the row.
//
// A unit's owner is its `agent_id`; a check's agent is the
// `agent_id` inside `local_checks`. A candidate unit is one
// with status `candidate`, or one that holds a fingerprint of
// findings.json in `result_fingerprints` or `unresolved`.
// -----
export const SCAN_RECORDS_PROFILE_CHECK_ROW_IDS = [
  "hunter-wave",
  "fresh-verifier-per-candidate",
  "final-critic-pass",
  "not-declared-incomplete",
  "units-not-coarsened",
  "final-records-fresh-verifier",
  "units-per-lifecycle-mode",
  "critic-waves-to-clean",
  "final-records-separate-verifier",
] as const;
export const SCAN_RECORDS_PROFILE_CHECK_FILES = ["coverage-ledger.json", "run-metadata.json", "findings.json"] as const;
export const SCAN_RECORDS_PROFILE_CHECK_ROWS: readonly ProfileCheckRow[] = [
  {
    id: "hunter-wave",
    profile: "quick",
    requirement: "One hunter wave ran: a unit with an owner is covered, blocked or a candidate, with a wave of 1 or more",
    file: "coverage-ledger.json",
    field: "wave, agent_id and status of each unit",
    needsSkillChange: false,
  },
  {
    id: "fresh-verifier-per-candidate",
    profile: "quick",
    requirement: "Every candidate unit has a check by an agent that is not the unit's owner, and every finding record sits on such a unit",
    file: "coverage-ledger.json",
    field: "local_checks[].agent_id against agent_id, result_fingerprints and unresolved; fingerprint in findings.json",
    needsSkillChange: false,
  },
  {
    id: "final-critic-pass",
    profile: "quick",
    requirement: "One final critic pass ran (a unit deferred as quick_profile_final_critic is the critic's own output and counts)",
    file: "run-metadata.json",
    field: "critic_passes[], or unresolved of a deferred unit in coverage-ledger.json",
    needsSkillChange: true,
  },
  {
    id: "not-declared-incomplete",
    profile: "quick",
    requirement: "The run does not say its verification was unavailable",
    file: "run-metadata.json",
    field: "run_status is not incomplete (incomplete_reason verification_unavailable)",
    needsSkillChange: true,
  },
  {
    id: "units-not-coarsened",
    profile: "standard",
    requirement: "Units are not coarsened to the Focused profile's one all-in-scope subsystem",
    file: "coverage-ledger.json",
    field: "canonical_refs.subsystem of each unit",
    needsSkillChange: false,
  },
  {
    id: "final-records-fresh-verifier",
    profile: "standard",
    requirement: "Each confirmed or needs_validation record was verified in the final pass by an agent that is not the owner of its unit",
    file: "run-metadata.json",
    field: "final_verifiers[].fingerprint and agent_id, against agent_id in coverage-ledger.json",
    needsSkillChange: true,
  },
  {
    id: "units-per-lifecycle-mode",
    profile: "deep",
    requirement: "Units are split per subsystem and lifecycle mode: at least one unit names a lifecycle mode",
    file: "coverage-ledger.json",
    field: "canonical_refs.lifecycle of each unit",
    needsSkillChange: false,
  },
  {
    id: "critic-waves-to-clean",
    profile: "deep",
    requirement: "Critic waves ran until one accepted nothing, and each wave that accepted work was followed by a later hunter wave",
    file: "run-metadata.json",
    field: "critic_passes[].wave and accepted, against wave in coverage-ledger.json",
    needsSkillChange: true,
  },
  {
    id: "final-records-separate-verifier",
    profile: "deep",
    requirement: "The final verifier of each confirmed or needs_validation record is not the owner or a validation verifier of its unit",
    file: "run-metadata.json",
    field: "final_verifiers[].agent_id, against every local_checks[].agent_id in coverage-ledger.json",
    needsSkillChange: true,
  },
];
