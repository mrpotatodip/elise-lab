import { FINDING_SEVERITY_VALUES, VERDICT_MIN_SCANS, type FindingSeverityValue, type SeverityCounts, type Verdict, type VerdictReasonCode } from "@repo/contracts/elise";
import { SCAN_RECORDS_PRIOR_LIMIT } from "#/modules/scan-records";
import { VERDICT_LIMITS } from "#/modules/verdict/constants";
import type { JudgedFinding, JudgedScan, JudgeInput } from "#/modules/verdict/types";
import { scanWeight } from "./scan-weight";

type Reason = Verdict["reasons"][number];

const rank = (severity: FindingSeverityValue | null): number => (severity === null ? FINDING_SEVERITY_VALUES.length : FINDING_SEVERITY_VALUES.indexOf(severity));

// -----
// One entry per problem, however many scans found it. The words
// come from the newest scan that saw it; the severity is the
// worst any scan gave it, so a second scan can only make the
// verdict stricter. A scan that could not rate it (needs
// validation) never lowers a rating another scan gave.
// -----
const unionOf = (findings: JudgedFinding[], newestFirst: JudgedScan[]): JudgedFinding[] => {
  const order = new Map(newestFirst.map((scan, index) => [scan.id, index]));
  const byFingerprint = new Map<string, JudgedFinding>();
  for (const finding of findings.toSorted((a, b) => (order.get(b.scanId) ?? 0) - (order.get(a.scanId) ?? 0))) {
    const seen = byFingerprint.get(finding.fingerprint);
    const severity = seen && rank(seen.severity) < rank(finding.severity) ? seen.severity : finding.severity;
    byFingerprint.set(finding.fingerprint, { ...finding, severity });
  }
  return [...byFingerprint.values()].toSorted((a, b) => rank(a.severity) - rank(b.severity) || a.title.localeCompare(b.title));
};

const detail = ({ fingerprint, title, severity, class: kind, file, line, impact, evidence, fix, needs }: JudgedFinding) => ({ fingerprint, title, severity, class: kind, file, line, impact, evidence, fix, needs });

const emptyCounts = (): SeverityCounts & { needsValidation: number } => ({ critical: 0, high: 0, medium: 0, low: 0, informational: 0, needsValidation: 0 });

// -----
// The newest scans that have a weight, taken until their
// weights reach VERDICT_MIN_SCANS. The window is all that the
// unchecked-priors rules read: an old scan that ran out of
// budget must not block a commit that good scans have since
// cleared.
// -----
const windowOf = (weighted: { scan: JudgedScan; weight: number }[]): JudgedScan[] => {
  const window: JudgedScan[] = [];
  let sum = 0;
  for (const { scan, weight } of weighted) {
    if (sum >= VERDICT_MIN_SCANS) break;
    window.push(scan);
    sum += weight;
  }
  return window;
};

// -----
// The scans cannot be trusted yet: too little weight of looks
// at this commit, or a look that did not check every known
// problem.
// -----
const trustReasons = (read: JudgedScan[], counted: number, window: JudgedScan[]): Reason[] => {
  if (read.length === 0) return [{ code: "not_scanned", message: "No succeeded scan of this commit that counts" }];
  const reasons: Reason[] = [];
  if (counted < VERDICT_MIN_SCANS) {
    reasons.push({ code: "too_few_scans", message: `Scans of this commit weigh ${counted} of ${VERDICT_MIN_SCANS}; run another` });
  }
  if (window.some((scan) => (scan.priorsUnchecked ?? 0) > 0)) {
    reasons.push({ code: "unchecked_priors", message: "A scan did not check every problem the History had open" });
  }
  if (window.some((scan) => (scan.priorsGiven ?? 0) >= SCAN_RECORDS_PRIOR_LIMIT)) {
    reasons.push({ code: "too_many_priors", message: `The History has ${SCAN_RECORDS_PRIOR_LIMIT} or more open problems, more than a scan can check` });
  }
  return reasons;
};

const overLimit = (counts: ReturnType<typeof emptyCounts>): Reason | null => {
  const over: string[] = [];
  if (counts.critical > VERDICT_LIMITS.critical) over.push(`${counts.critical} critical`);
  if (counts.high > VERDICT_LIMITS.high) over.push(`${counts.high} high`);
  if (counts.medium > VERDICT_LIMITS.medium) over.push(`${counts.medium} medium (at most ${VERDICT_LIMITS.medium})`);
  if (counts.needsValidation > 0) over.push(`${counts.needsValidation} not yet validated`);
  return over.length > 0 ? { code: "over_limit", message: `Open: ${over.join(", ")}` } : null;
};

// -----
// Can this commit ship? Every rule is here and nothing else
// is: no database, no clock. The caller gives the succeeded
// scans of the commit and their findings.
//
// A scan is read when it has a weight, is partial, or met no
// profile: such a scan adds no weight, but it is a look at the
// commit, so it is listed and its findings still count as open.
// An older full scan has none of the three, so it is not a look
// at all.
//
// A person's decision counts only where the commit's own
// scans do not contradict it: a false positive, a duplicate
// (it never counts; the Finding it points to carries the
// problem by its own decision) and an unexpired accepted risk
// are taken off the open list and shown beside it, and
// "fixed" is ignored, because the scan
// of this commit found the problem here.
// -----
export const judgeCommit = ({ commit, scans, findings, triage, now }: JudgeInput): Verdict => {
  const newestFirst = scans.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const weights = newestFirst.map((scan) => ({ scan, weight: scanWeight(scan) }));
  const weighted = weights.filter(({ weight }) => weight > 0);
  const counted = weighted.reduce((sum, { weight }) => sum + weight, 0);
  const window = windowOf(weighted);
  const read = weights.filter(({ weight, scan }) => weight > 0 || scan.partial === true || scan.profileMet === "none").map(({ scan }) => scan);
  const decisions = new Map(triage.map((row) => [row.fingerprint, row]));

  const open: Verdict["open"] = [];
  const accepted: Verdict["accepted"] = [];
  const dismissed: Verdict["dismissed"] = [];
  const counts = emptyCounts();

  for (const finding of unionOf(findings, newestFirst)) {
    const decision = decisions.get(finding.fingerprint);
    if (decision?.status === "false_positive") {
      dismissed.push(detail(finding));
      continue;
    }
    if (decision?.status === "duplicate") {
      dismissed.push({ ...detail(finding), duplicateOf: decision.duplicateOf });
      continue;
    }
    const until = decision?.status === "accepted_risk" ? decision.acceptedUntil : null;
    if (decision && until && until.getTime() > now.getTime()) {
      accepted.push({ ...detail(finding), note: decision.note ?? "", acceptedUntil: until.toISOString() });
      continue;
    }
    open.push({ ...detail(finding), acceptanceExpiredAt: until ? until.toISOString() : null });
    if (finding.severity === null) counts.needsValidation += 1;
    else counts[finding.severity] += 1;
  }

  const untrusted = trustReasons(read, counted, window);
  const over = overLimit(counts);
  const reasons: Reason[] = over ? [...untrusted, over] : untrusted;
  const code: VerdictReasonCode | null = reasons[0]?.code ?? null;

  return {
    verdict: untrusted.length > 0 ? "cannot_tell" : code === "over_limit" ? "fail" : "pass",
    basis: "ai_audit",
    commit,
    reasons,
    scans: { required: VERDICT_MIN_SCANS, counted, ids: read.map((scan) => scan.id) },
    limits: { ...VERDICT_LIMITS },
    counts,
    open,
    accepted,
    dismissed,
  };
};
