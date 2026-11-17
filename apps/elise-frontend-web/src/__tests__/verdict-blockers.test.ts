import { describe, expect, it } from "vitest";
import type { Verdict } from "#/modules/scan";
import { openProblemsSummary, verdictBlockers } from "#/modules/scan/utils/verdict-blockers";

const open = (fingerprint: string, severity: Verdict["open"][number]["severity"]): Verdict["open"][number] => ({
  fingerprint,
  title: fingerprint,
  severity,
  class: "x",
  file: null,
  line: null,
  acceptanceExpiredAt: null,
});

const verdict = (findings: Verdict["open"], counts: Partial<Verdict["counts"]> = {}): Verdict => ({
  verdict: "fail",
  commit: "f85df51",
  reasons: [],
  scans: { required: 2, counted: 2, ids: [] },
  limits: { critical: 0, high: 0, medium: 3 },
  counts: { critical: 0, high: 0, medium: 0, low: 0, informational: 0, needsValidation: 0, ...counts },
  open: findings,
  accepted: [],
  dismissed: [],
});

describe("verdictBlockers", () => {
  it("blocks on a problem a person has not validated yet, and not on a low one", () => {
    const found = verdictBlockers(verdict([open("unrated", null), open("low", "low")], { low: 1, needsValidation: 1 }));

    expect([...found]).toEqual(["unrated"]);
  });

  it("blocks on any critical or high problem, since none are allowed", () => {
    const found = verdictBlockers(verdict([open("c", "critical"), open("h", "high"), open("i", "informational")], { critical: 1, high: 1, informational: 1 }));

    expect([...found].toSorted()).toEqual(["c", "h"]);
  });

  it.each([
    { medium: 3, blocked: 0 },
    { medium: 4, blocked: 4 },
  ])("blocks on medium problems only above the limit: $medium open, $blocked blocking", ({ medium, blocked }) => {
    const findings = Array.from({ length: medium }, (_, index) => open(`m${index + 1}`, "medium"));

    expect(verdictBlockers(verdict(findings, { medium })).size).toBe(blocked);
  });
});

describe("openProblemsSummary", () => {
  it.each([
    { open: 1, blocking: 1, text: "It blocks shipping." },
    { open: 3, blocking: 3, text: "All of them block shipping." },
    { open: 1, blocking: 0, text: "It does not block shipping on its own." },
    { open: 2, blocking: 0, text: "None of them blocks shipping on its own." },
    { open: 2, blocking: 1, text: "1 of them blocks shipping, marked in the list below. The rest are within the limits." },
    { open: 4, blocking: 2, text: "2 of them block shipping, marked in the list below. The rest are within the limits." },
  ])("says $text for $blocking of $open", ({ open: total, blocking, text }) => {
    expect(openProblemsSummary(total, blocking)).toBe(text);
  });
});
