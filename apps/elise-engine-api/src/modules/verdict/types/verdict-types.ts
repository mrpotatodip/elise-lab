import type { FindingSeverityValue, FindingTriageStatusValue } from "@repo/contracts/elise";

// -----
// A succeeded scan of the commit, with the three columns its
// weight is read from (skill, profile, partial: null on a
// lite scan and on a full scan recorded before the column).
// The two counts come from the scan's re-check of the
// History; null means the scan asked about nothing (a scan of
// a ref, or one from before re-checks).
// -----
export type JudgedScan = {
  id: string;
  createdAt: Date;
  skill: string;
  profile: string;
  partial: boolean | null;
  priorsGiven: number | null;
  priorsUnchecked: number | null;
};

export type JudgedFinding = {
  scanId: string;
  fingerprint: string;
  title: string;
  severity: FindingSeverityValue | null;
  class: string;
  file: string | null;
  line: number | null;
  impact?: string | null;
  evidence?: string | null;
  fix?: string | null;
  needs?: string | null;
};

export type JudgedTriage = {
  fingerprint: string;
  status: FindingTriageStatusValue;
  note: string | null;
  acceptedUntil: Date | null;
};

export type JudgeInput = {
  commit: string;
  scans: JudgedScan[];
  findings: JudgedFinding[];
  triage: JudgedTriage[];
  now: Date;
};
