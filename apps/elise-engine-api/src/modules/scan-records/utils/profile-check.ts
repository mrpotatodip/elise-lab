import { SCAN_PROFILES, type ProfileMetValue } from "@repo/contracts/elise";
import {
  SCAN_RECORDS_PROFILE_CHECK_FINAL_VERDICTS,
  SCAN_RECORDS_PROFILE_CHECK_FOCUSED_DEFERRED_REASON,
  SCAN_RECORDS_PROFILE_CHECK_HUNTED_STATUSES,
  SCAN_RECORDS_PROFILE_CHECK_QUICK_SUBSYSTEM,
  SCAN_RECORDS_PROFILE_CHECK_ROWS,
} from "#/modules/scan-records/constants";
import { ProfileCheckFindingsTextSchema, ProfileCheckLedgerTextSchema, ProfileCheckMetadataTextSchema, type ProfileCheckFinding, type ProfileCheckUnit } from "#/modules/scan-records/schemas";
import type { ProfileCheck, ProfileCheckFacts, ProfileCheckFiles, ProfileCheckRowId, ScanProfile } from "#/modules/scan-records/types";
import { isPartialScan } from "./is-partial-scan";

const isWave = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isInteger(value) && value >= 1;

const holds = (unit: ProfileCheckUnit, fingerprint: string): boolean => unit.result_fingerprints.includes(fingerprint) || unit.unresolved.includes(fingerprint);

const holdersOf = (facts: ProfileCheckFacts, fingerprint: string): ProfileCheckUnit[] => facts.units.filter((unit) => holds(unit, fingerprint));

const hasOtherChecker = (unit: ProfileCheckUnit): boolean => unit.local_checks.some((check) => check.agent_id !== unit.agent_id);

const isCandidateUnit = (unit: ProfileCheckUnit, findings: ProfileCheckFinding[]): boolean =>
  unit.status === "candidate" || unit.result_fingerprints.length > 0 || findings.some((finding) => holds(unit, finding.fingerprint));

const finalRecords = (facts: ProfileCheckFacts): ProfileCheckFinding[] =>
  facts.findings.filter((finding) => SCAN_RECORDS_PROFILE_CHECK_FINAL_VERDICTS.includes(finding.verdict));

const finalVerifiersOf = (facts: ProfileCheckFacts, fingerprint: string): string[] =>
  facts.metadata.final_verifiers.filter((entry) => entry.fingerprint === fingerprint).map((entry) => entry.agent_id);

const everyFinalRecordHasVerifierOutside = (facts: ProfileCheckFacts, agentsOf: (holders: ProfileCheckUnit[]) => string[]): boolean =>
  finalRecords(facts).every((record) => {
    const holders = holdersOf(facts, record.fingerprint);
    const excluded = agentsOf(holders);
    return holders.length > 0 && finalVerifiersOf(facts, record.fingerprint).some((agent) => !excluded.includes(agent));
  });

const ownersOf = (holders: ProfileCheckUnit[]): string[] => holders.flatMap((unit) => (unit.agent_id ? [unit.agent_id] : []));

const everyoneOn = (holders: ProfileCheckUnit[]): string[] => holders.flatMap((unit) => [...ownersOf([unit]), ...unit.local_checks.map((check) => check.agent_id)]);

const RULES = {
  "hunter-wave": (facts) => facts.units.some((unit) => unit.agent_id && SCAN_RECORDS_PROFILE_CHECK_HUNTED_STATUSES.includes(unit.status) && isWave(unit.wave)),
  "fresh-verifier-per-candidate": (facts) =>
    facts.units.filter((unit) => isCandidateUnit(unit, facts.findings)).every(hasOtherChecker) &&
    finalRecords(facts).every((finding) => holdersOf(facts, finding.fingerprint).some(hasOtherChecker)),
  "final-critic-pass": (facts) =>
    facts.metadata.critic_passes.length > 0 ||
    facts.units.some((unit) => unit.status === "deferred" && unit.unresolved.some((reason) => reason.startsWith(SCAN_RECORDS_PROFILE_CHECK_FOCUSED_DEFERRED_REASON))),
  "not-declared-incomplete": (facts) => facts.metadata.run_status !== "incomplete",
  "units-not-coarsened": (facts) => facts.units.length > 0 && facts.units.every((unit) => unit.canonical_refs?.subsystem !== SCAN_RECORDS_PROFILE_CHECK_QUICK_SUBSYSTEM),
  "final-records-fresh-verifier": (facts) => everyFinalRecordHasVerifierOutside(facts, ownersOf),
  "units-per-lifecycle-mode": (facts) => facts.units.some((unit) => Boolean(unit.canonical_refs?.lifecycle)),
  "critic-waves-to-clean": (facts) => {
    const passes = facts.metadata.critic_passes;
    const last = passes.at(-1);
    return last !== undefined && last.accepted === 0 && passes.every((pass) => pass.accepted === 0 || facts.maxWave > pass.wave);
  },
  "final-records-separate-verifier": (facts) => everyFinalRecordHasVerifierOutside(facts, everyoneOn),
} satisfies Record<ProfileCheckRowId, (facts: ProfileCheckFacts) => boolean>;

const isHonestUnit = (unit: ProfileCheckUnit): boolean => {
  if (unit.local_checks.length > 0 && (!unit.agent_id || !isWave(unit.wave))) return false;
  let previous = 0;
  for (const attempt of unit.attempts) {
    if (!isWave(attempt.wave) || attempt.wave <= previous || !isWave(unit.wave) || attempt.wave >= unit.wave) return false;
    previous = attempt.wave;
  }
  return true;
};

const isHonest = (facts: ProfileCheckFacts): boolean =>
  facts.units.every(isHonestUnit) && facts.metadata.critic_passes.every((pass) => isWave(pass.wave) && pass.wave <= facts.maxWave);

const factsOf = (files: ProfileCheckFiles): ProfileCheckFacts | null => {
  if (files.ledger === null) return null;
  const ledger = ProfileCheckLedgerTextSchema.safeParse(files.ledger);
  const metadata = ProfileCheckMetadataTextSchema.safeParse(files.metadata ?? "{}");
  const findings = ProfileCheckFindingsTextSchema.safeParse(files.findings ?? "[]");
  if (!ledger.success || !metadata.success || !findings.success) return null;
  const waves = ledger.data.flatMap((unit) => (isWave(unit.wave) ? [unit.wave] : []));
  return { units: ledger.data, metadata: metadata.data, findings: findings.data, maxWave: Math.max(0, ...waves) };
};

const highestMetIndex = (facts: ProfileCheckFacts): number => {
  let highest = -1;
  for (const [index, profile] of SCAN_PROFILES.entries()) {
    const rows = SCAN_RECORDS_PROFILE_CHECK_ROWS.filter((row) => row.profile === profile);
    if (!rows.every((row) => RULES[row.id](facts))) return highest;
    highest = index;
  }
  return highest;
};

export const checkRunnerProfile = (asked: ScanProfile, files: ProfileCheckFiles): ProfileCheck | null => {
  if (isPartialScan(files.report, files.ledger, files.metadata)) return null;
  const facts = factsOf(files);
  if (facts === null || !isHonest(facts)) return { result: "unmet" };
  const reached = highestMetIndex(facts);
  const askedIndex = SCAN_PROFILES.indexOf(asked);
  if (reached >= askedIndex) return { result: "met" };
  const lesser = SCAN_PROFILES[reached];
  return lesser === undefined ? { result: "unmet" } : { result: "lesser", profile: lesser };
};

export const profileMetOf = (asked: ScanProfile, check: ProfileCheck | null): ProfileMetValue | null => {
  if (check === null) return null;
  if (check.result === "met") return asked;
  return check.result === "lesser" ? check.profile : "none";
};
