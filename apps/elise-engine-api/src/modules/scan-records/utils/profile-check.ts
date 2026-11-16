import {
  PROFILE_CHECK_FOCUSED_DEFERRED_REASON,
  PROFILE_CHECK_QUICK_SUBSYSTEM,
  PROFILE_CHECK_ROWS,
  SCAN_PROFILES,
  type ProfileCheck,
  type ProfileCheckRowId,
} from "@repo/contracts/elise";
import {
  ProfileCheckFindingsTextSchema,
  ProfileCheckLedgerTextSchema,
  ProfileCheckMetadataTextSchema,
  type ProfileCheckFinding,
  type ProfileCheckMetadata,
  type ProfileCheckUnit,
} from "#/modules/scan-records/schemas";
import { isPartialScan } from "./is-partial-scan";

type Profile = (typeof SCAN_PROFILES)[number];

interface Facts {
  units: ProfileCheckUnit[];
  metadata: ProfileCheckMetadata;
  findings: ProfileCheckFinding[];
  maxWave: number;
}

export interface ProfileCheckFiles {
  report: string | null;
  ledger: string | null;
  metadata: string | null;
  findings: string | null;
}

const HUNTED_STATUSES = ["covered", "blocked", "candidate"];
const FINAL_VERDICTS = ["confirmed", "needs_validation"];

const isWave = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isInteger(value) && value >= 1;

const holds = (unit: ProfileCheckUnit, fingerprint: string): boolean => unit.result_fingerprints.includes(fingerprint) || unit.unresolved.includes(fingerprint);

const holdersOf = (facts: Facts, fingerprint: string): ProfileCheckUnit[] => facts.units.filter((unit) => holds(unit, fingerprint));

const hasOtherChecker = (unit: ProfileCheckUnit): boolean => unit.local_checks.some((check) => check.agent_id !== unit.agent_id);

const isCandidateUnit = (unit: ProfileCheckUnit, findings: ProfileCheckFinding[]): boolean =>
  unit.status === "candidate" || unit.result_fingerprints.length > 0 || findings.some((finding) => holds(unit, finding.fingerprint));

const finalRecords = (facts: Facts): ProfileCheckFinding[] => facts.findings.filter((finding) => FINAL_VERDICTS.includes(finding.verdict));

const finalVerifiersOf = (facts: Facts, fingerprint: string): string[] =>
  facts.metadata.final_verifiers.filter((entry) => entry.fingerprint === fingerprint).map((entry) => entry.agent_id);

const everyFinalRecordHasVerifierOutside = (facts: Facts, agentsOf: (holders: ProfileCheckUnit[]) => string[]): boolean =>
  finalRecords(facts).every((record) => {
    const holders = holdersOf(facts, record.fingerprint);
    const excluded = agentsOf(holders);
    return holders.length > 0 && finalVerifiersOf(facts, record.fingerprint).some((agent) => !excluded.includes(agent));
  });

const ownersOf = (holders: ProfileCheckUnit[]): string[] => holders.flatMap((unit) => (unit.agent_id ? [unit.agent_id] : []));

const everyoneOn = (holders: ProfileCheckUnit[]): string[] => holders.flatMap((unit) => [...ownersOf([unit]), ...unit.local_checks.map((check) => check.agent_id)]);

const RULES = {
  "hunter-wave": (facts) => facts.units.some((unit) => unit.agent_id && HUNTED_STATUSES.includes(unit.status) && isWave(unit.wave)),
  "fresh-verifier-per-candidate": (facts) =>
    facts.units.filter((unit) => isCandidateUnit(unit, facts.findings)).every(hasOtherChecker) &&
    facts.findings.every((finding) => holdersOf(facts, finding.fingerprint).some(hasOtherChecker)),
  "final-critic-pass": (facts) =>
    facts.metadata.critic_passes.length > 0 ||
    facts.units.some((unit) => unit.status === "deferred" && unit.unresolved.some((reason) => reason.startsWith(PROFILE_CHECK_FOCUSED_DEFERRED_REASON))),
  "not-declared-incomplete": (facts) => facts.metadata.run_status !== "incomplete",
  "units-not-coarsened": (facts) => facts.units.length > 0 && facts.units.every((unit) => unit.canonical_refs?.subsystem !== PROFILE_CHECK_QUICK_SUBSYSTEM),
  "final-records-fresh-verifier": (facts) => everyFinalRecordHasVerifierOutside(facts, ownersOf),
  "units-per-lifecycle-mode": (facts) => facts.units.some((unit) => Boolean(unit.canonical_refs?.lifecycle)),
  "critic-waves-to-clean": (facts) => {
    const passes = facts.metadata.critic_passes;
    const last = passes.at(-1);
    return last !== undefined && last.accepted === 0 && passes.every((pass) => pass.accepted === 0 || facts.maxWave > pass.wave);
  },
  "final-records-separate-verifier": (facts) => everyFinalRecordHasVerifierOutside(facts, everyoneOn),
} satisfies Record<ProfileCheckRowId, (facts: Facts) => boolean>;

const isHonestUnit = (unit: ProfileCheckUnit): boolean => {
  if (unit.local_checks.length > 0 && (!unit.agent_id || !isWave(unit.wave))) return false;
  let previous = 0;
  for (const attempt of unit.attempts) {
    if (!isWave(attempt.wave) || attempt.wave <= previous || !isWave(unit.wave) || attempt.wave >= unit.wave) return false;
    previous = attempt.wave;
  }
  return true;
};

const isHonest = (facts: Facts): boolean =>
  facts.units.every(isHonestUnit) && facts.metadata.critic_passes.every((pass) => isWave(pass.wave) && pass.wave <= facts.maxWave);

const factsOf = (files: ProfileCheckFiles): Facts | null => {
  if (files.ledger === null) return null;
  const ledger = ProfileCheckLedgerTextSchema.safeParse(files.ledger);
  const metadata = ProfileCheckMetadataTextSchema.safeParse(files.metadata ?? "{}");
  const findings = ProfileCheckFindingsTextSchema.safeParse(files.findings ?? "[]");
  if (!ledger.success || !metadata.success || !findings.success) return null;
  const waves = ledger.data.flatMap((unit) => (isWave(unit.wave) ? [unit.wave] : []));
  return { units: ledger.data, metadata: metadata.data, findings: findings.data, maxWave: Math.max(0, ...waves) };
};

const highestMetIndex = (facts: Facts): number => {
  let highest = -1;
  for (const [index, profile] of SCAN_PROFILES.entries()) {
    const rows = PROFILE_CHECK_ROWS.filter((row) => row.profile === profile);
    if (!rows.every((row) => RULES[row.id](facts))) return highest;
    highest = index;
  }
  return highest;
};

// -----
// The profile check: what a succeeded Runner Scan did, read from
// the files its agent wrote, against what the profile asked for
// requires (PROFILE_CHECK_ROWS). A Partial Scan (money ran out) is
// not checked and gives null. Files that cannot be parsed, or a
// ledger the agent could not have written honestly (a check with
// no wave, an attempt out of order, a critic pass after a wave
// that never ran), give unmet: no row can be believed. A profile
// is met only when its rows and those of every smaller profile
// pass, so a result is never raised above what the files show.
// -----
export const checkRunnerProfile = (asked: Profile, files: ProfileCheckFiles): ProfileCheck | null => {
  if (isPartialScan(files.report, files.ledger, files.metadata)) return null;
  const facts = factsOf(files);
  if (facts === null || !isHonest(facts)) return { result: "unmet" };
  const reached = highestMetIndex(facts);
  const askedIndex = SCAN_PROFILES.indexOf(asked);
  if (reached >= askedIndex) return { result: "met" };
  const lesser = SCAN_PROFILES[reached];
  return lesser === undefined ? { result: "unmet" } : { result: "lesser", profile: lesser };
};
