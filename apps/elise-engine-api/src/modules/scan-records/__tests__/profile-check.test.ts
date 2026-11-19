import { describe, expect, it } from "vitest";
import { SCAN_RECORDS_PROFILE_CHECK_FOCUSED_DEFERRED_REASON, SCAN_RECORDS_PROFILE_CHECK_QUICK_SUBSYSTEM } from "#/modules/scan-records/constants";
import type { ProfileCheckFiles, ScanProfile } from "#/modules/scan-records/types";
import { checkRunnerProfile } from "#/modules/scan-records/utils";

type Check = {
  agent_id: string;
  reviewed_paths: string[];
  invariant: string;
  method: string;
  result: string;
  artifact: null;
};

type Refs = {
  surface: string;
  boundary: string;
  subsystem: string;
  attack_class: string;
  lifecycle?: string;
};

type Attempt = {
  wave: number;
  agent_id: string;
};

type Unit = {
  coverage_id: string;
  canonical_refs: Refs;
  surface: string;
  boundary: string;
  subsystem: string;
  attack_class: string;
  starting_paths: string[];
  ordinary_attack_class_block: string;
  selected_companion_blocks: string[];
  excluded_blocks: string[];
  prior_status: string;
  attempts: Attempt[];
  wave: number | null;
  status: string;
  agent_id: string | null;
  reviewed_paths: string[];
  local_checks: Check[];
  result_fingerprints: string[];
  unresolved: string[];
};

type MetadataExtra = {
  run_status?: string;
  incomplete_reason?: string;
  critic_passes?: { wave: number; accepted: number | string[] }[];
  final_verifiers?: { fingerprint: string; agent_id: string }[];
  phase_completed?: number | string;
  phase_2_note?: string;
  report_note?: string;
};

type Record_ = {
  verdict: string;
  fingerprint: string;
  title: string;
};

const checkBy = (agent: string): Check => ({
  agent_id: agent,
  reviewed_paths: ["src/a.ts"],
  invariant: "The route checks the owner",
  method: "source",
  result: "src/a.ts checks the owner before the read",
  artifact: null,
});

const unitOf = (id: string, over: Partial<Unit>): Unit => ({
  coverage_id: id,
  canonical_refs: { surface: `${id}.ts`, boundary: "boundary", subsystem: SCAN_RECORDS_PROFILE_CHECK_QUICK_SUBSYSTEM, attack_class: "ATTACK-CLASSES.md#Access control" },
  surface: `${id}.ts`,
  boundary: "boundary",
  subsystem: "All in-scope subsystems (quick profile)",
  attack_class: "Access control",
  starting_paths: ["src/a.ts"],
  ordinary_attack_class_block: "ATTACK-CLASSES.md#Access control",
  selected_companion_blocks: [],
  excluded_blocks: [],
  prior_status: "none",
  attempts: [],
  wave: 1,
  status: "covered",
  agent_id: "hunter-inline",
  reviewed_paths: ["src/a.ts"],
  local_checks: [checkBy("hunter-inline")],
  result_fingerprints: [],
  unresolved: [],
  ...over,
});

const coveredBy = (id: string, owner: string, over: Partial<Unit> = {}): Unit => unitOf(id, { agent_id: owner, local_checks: [checkBy(owner)], ...over });

const deferredByCritic = (id: string): Unit =>
  unitOf(id, {
    status: "deferred",
    agent_id: null,
    reviewed_paths: [],
    local_checks: [],
    unresolved: [`${SCAN_RECORDS_PROFILE_CHECK_FOCUSED_DEFERRED_REASON}: needs node_modules, which is not available`],
  });

const candidateOf = (id: string, owner: string, verifiers: string[], fingerprint: string, over: Partial<Unit> = {}): Unit =>
  unitOf(id, {
    status: "candidate",
    agent_id: owner,
    local_checks: [checkBy(owner), ...verifiers.map(checkBy)],
    result_fingerprints: [fingerprint],
    ...over,
  });

const standardRefs = (subsystem: string): Refs => ({ surface: "s", boundary: "b", subsystem, attack_class: "ATTACK-CLASSES.md#Access control" });

const lifecycleRefs = (subsystem: string, lifecycle: string): Refs => ({ ...standardRefs(subsystem), lifecycle });

const metadataOf = (profile: string, over: MetadataExtra = {}): string =>
  JSON.stringify(Object.assign({ run_id: "run-1", repo: "ts-elise-oss", profile, scope_paths: ["."], execution_policy: "sandboxed-source-and-local-only", run_status: "complete" }, over));

const recordOf = (verdict: string, fingerprint: string): Record_ => ({ verdict, fingerprint, title: "A finding" });

const filesOf = (ledger: Unit[], metadata: string, findings: Record_[] = []): ProfileCheckFiles => ({
  report: "# Report\n\nA quick pass.\n",
  ledger: JSON.stringify(ledger),
  metadata,
  findings: JSON.stringify(findings),
});

const FOCUSED_RUN3 = filesOf(
  [
    coveredBy("a", "hunter-inline"),
    coveredBy("b", "hunter-inline"),
    deferredByCritic("c"),
    deferredByCritic("d"),
  ],
  metadataOf("quick", { phase_completed: 6, phase_2_note: "One hunter wave and one final critic pass. 2 critic units were deferred." }),
);

const FOCUSED_NEW_SKILL = filesOf([coveredBy("a", "hunter-1"), coveredBy("b", "hunter-1")], metadataOf("quick", { critic_passes: [{ wave: 1, accepted: 0 }] }));

const FOCUSED_MONOREPO = filesOf(
  [
    coveredBy("a", "h1"),
    coveredBy("b", "h2"),
    candidateOf("c", "h4", ["verifier-c"], "install-claim-checks-installation"),
    candidateOf("d", "h3", ["verifier-d"], "outbound-meter-bypass"),
    deferredByCritic("e"),
  ],
  metadataOf("quick", { critic_passes: [{ wave: 1, accepted: 1 }] }),
  [recordOf("needs_validation", "install-claim-checks-installation"), recordOf("rejected", "outbound-meter-bypass")],
);

const balancedOfRun4 = (extraMetadata: MetadataExtra) => {
  const refs = standardRefs;
  return filesOf(
    [
      coveredBy("a", "parent-hunter", { canonical_refs: refs("package.json") }),
      coveredBy("b", "parent-hunter", {
        canonical_refs: refs("core/reducers"),
        local_checks: [checkBy("parent-hunter"), checkBy("verifier-reducer-keys")],
        unresolved: ["agui-loading-reducer-inherited-key-lookup"],
      }),
      coveredBy("c", "parent-hunter", {
        canonical_refs: refs("core/devtools"),
        local_checks: [checkBy("parent-hunter"), checkBy("verifier-state-devtools")],
        unresolved: ["docs-root-devtools-not-dev-guarded"],
      }),
      unitOf("d", { canonical_refs: refs("wrangler.jsonc"), status: "blocked", agent_id: "parent-hunter", local_checks: [checkBy("parent-hunter")], unresolved: ["Deployed response headers are not in the repository"] }),
    ],
    metadataOf("standard", { phase_completed: "6-report", report_note: "No coverage-critic pass ran. Two units are blocked.", ...extraMetadata }),
    [recordOf("rejected", "agui-loading-reducer-inherited-key-lookup"), recordOf("rejected", "docs-root-devtools-not-dev-guarded")],
  );
};

const exhaustiveOf = (finalAgent: string, over: { metadata?: MetadataExtra; ledger?: Unit[] } = {}): ProfileCheckFiles =>
  filesOf(
    over.ledger ?? [
      coveredBy("a", "hunter-a", { canonical_refs: lifecycleRefs("auth", "request"), wave: 2, attempts: [{ wave: 1, agent_id: "hunter-a0" }] }),
      candidateOf("b", "hunter-b", ["verifier-v1"], "fp-1", { canonical_refs: lifecycleRefs("billing", "startup") }),
    ],
    metadataOf("deep", {
      critic_passes: [
        { wave: 1, accepted: 2 },
        { wave: 2, accepted: 0 },
      ],
      final_verifiers: [{ fingerprint: "fp-1", agent_id: finalAgent }],
      ...over.metadata,
    }),
    [recordOf("needs_validation", "fp-1")],
  );

const verdictOf = (profile: ScanProfile, files: ProfileCheckFiles) => checkRunnerProfile(profile, files);

describe("checkRunnerProfile", () => {
  describe("a Scan that did its profile's work is met", () => {
    it.each([
      ["Focused, one agent, units deferred as quick_profile_final_critic (old Skill)", "quick", FOCUSED_RUN3],
      ["Focused, one agent, critic pass recorded and nothing deferred", "quick", FOCUSED_NEW_SKILL],
      ["Focused, five hunters, a fresh verifier on each candidate", "quick", FOCUSED_MONOREPO],
      [
        "Focused whose critic pass lists no accepted unit instead of counting zero (a Runner Scan on 2026-11-19)",
        "quick",
        filesOf([coveredBy("a", "hunter-1"), candidateOf("c", "h4", ["verifier-c"], "fp-1")], metadataOf("quick", { critic_passes: [{ wave: 1, accepted: [] }] }), [recordOf("needs_validation", "fp-1")]),
      ],
      [
        "Focused whose critic pass lists the units it accepted instead of counting them",
        "quick",
        filesOf([coveredBy("a", "hunter-1"), candidateOf("c", "h4", ["verifier-c"], "fp-1")], metadataOf("quick", { critic_passes: [{ wave: 1, accepted: ["unit-a", "unit-b"] }] }), [recordOf("needs_validation", "fp-1")]),
      ],
      [
        "Focused whose findings.json holds a rejected record that no unit holds, next to a record verified by another agent",
        "quick",
        filesOf(
          [coveredBy("a", "h1"), candidateOf("c", "h4", ["verifier-c"], "fp-1")],
          metadataOf("quick", { critic_passes: [{ wave: 1, accepted: 0 }] }),
          [recordOf("needs_validation", "fp-1"), recordOf("rejected", "orphan-rejected")],
        ),
      ],
      ["Balanced, the real run's shape (four rejected candidates, fresh verifiers) with a critic pass recorded", "standard", balancedOfRun4({ critic_passes: [{ wave: 1, accepted: 0 }] })],
      ["Balanced, a critic pass and a fresh final verifier", "standard", exhaustiveOf("final-v1", { metadata: { critic_passes: [{ wave: 1, accepted: 0 }] } })],
      ["Exhaustive, lifecycle units, critic waves to a clean one, a separate final verifier", "deep", exhaustiveOf("final-v1")],
    ] as const)("%s", (_name, profile, files) => {
      expect(verdictOf(profile, files)).toEqual({ result: "met" });
    });
  });

  describe("a Scan that did the work of a smaller profile is lesser, naming it", () => {
    it.each([
      ["Exhaustive whose final verifier is the validation verifier meets Balanced", "deep", exhaustiveOf("verifier-v1"), "standard"],
      [
        "Exhaustive whose critic never came back clean meets Balanced",
        "deep",
        exhaustiveOf("final-v1", { metadata: { critic_passes: [{ wave: 1, accepted: 2 }] } }),
        "standard",
      ],
      [
        "Exhaustive with no lifecycle units meets Balanced",
        "deep",
        exhaustiveOf("final-v1", {
          ledger: [coveredBy("a", "hunter-a", { canonical_refs: standardRefs("auth"), wave: 2 }), candidateOf("b", "hunter-b", ["verifier-v1"], "fp-1", { canonical_refs: standardRefs("billing") })],
        }),
        "standard",
      ],
      ["Exhaustive that did a Focused ledger meets Focused", "deep", FOCUSED_MONOREPO, "quick"],
      ["Balanced that did a Focused ledger meets Focused", "standard", FOCUSED_RUN3, "quick"],
      [
        "Balanced with no final verifier for its record meets Focused",
        "standard",
        { ...exhaustiveOf("final-v1"), metadata: metadataOf("standard", { critic_passes: [{ wave: 1, accepted: 0 }] }) },
        "quick",
      ],
    ] as const)("%s", (_name, profile, files, met) => {
      expect(verdictOf(profile, files)).toEqual({ result: "lesser", profile: met });
    });
  });

  describe("a Scan that did none of its profile's work is unmet", () => {
    it.each([
      ["a candidate that only its owner checked (the monorepo run, no verifier recorded)", "quick", filesOf([candidateOf("c", "h4", [], "fp-9"), deferredByCritic("e")], metadataOf("quick"), [recordOf("needs_validation", "fp-9")])],
      ["a Balanced run of the real shape, with no critic pass recorded (an app built before the Skill change)", "standard", balancedOfRun4({})],
      ["a Focused run with no critic pass and nothing deferred", "quick", filesOf([coveredBy("a", "hunter-1")], metadataOf("quick"))],
      ["a ledger with no unit that a hunter owned", "quick", filesOf([deferredByCritic("a")], metadataOf("quick", { critic_passes: [{ wave: 1, accepted: 1 }] }))],
      ["a finding that no unit holds", "quick", filesOf([coveredBy("a", "hunter-1")], metadataOf("quick", { critic_passes: [{ wave: 1, accepted: 0 }] }), [recordOf("confirmed", "orphan")])],
      [
        "a run that says its verification was unavailable",
        "quick",
        filesOf([coveredBy("a", "hunter-1")], metadataOf("quick", { run_status: "incomplete", incomplete_reason: "verification_unavailable", critic_passes: [{ wave: 1, accepted: 0 }] })),
      ],
      ["a ledger that is not JSON", "quick", { ...FOCUSED_RUN3, ledger: "not json" }],
      ["no ledger", "deep", { ...FOCUSED_RUN3, ledger: null }],
    ] as const)("%s", (_name, profile, files) => {
      expect(verdictOf(profile, files)).toEqual({ result: "unmet" });
    });
  });

  describe("a Partial Scan is not checked", () => {
    it.each([
      ["the report's first line is the money line", { ...FOCUSED_RUN3, report: "PARTIAL: money ran out; 3 units were not covered.\n" }],
      [
        "a unit holds money_exhausted",
        filesOf([coveredBy("a", "hunter-1"), unitOf("b", { status: "deferred", agent_id: null, reviewed_paths: [], local_checks: [], unresolved: ["money_exhausted"] })], metadataOf("quick")),
      ],
      ["the metadata says money_exhausted", filesOf([coveredBy("a", "hunter-1")], metadataOf("quick", { run_status: "incomplete", incomplete_reason: "money_exhausted" }))],
    ] as const)("%s", (_name, files) => {
      expect(verdictOf("quick", files)).toBeNull();
    });

    it("a PARTIAL: line about verification is not money, so the Scan is checked and unmet", () => {
      const files = {
        ...FOCUSED_NEW_SKILL,
        report: "PARTIAL: I could not verify the candidates.\n",
        metadata: metadataOf("quick", { run_status: "incomplete", incomplete_reason: "verification_unavailable", critic_passes: [{ wave: 1, accepted: 0 }] }),
      };

      expect(verdictOf("quick", files)).toEqual({ result: "unmet" });
    });
  });

  describe("a ledger the agent could not have produced honestly is not met", () => {
    const verified = (over: Partial<Unit>) => candidateOf("c", "h4", ["verifier-c"], "fp-1", over);
    const honest = (candidate: Unit, metadata: MetadataExtra = { critic_passes: [{ wave: 1, accepted: 0 }] }) =>
      filesOf([coveredBy("a", "h1"), candidate], metadataOf("quick", metadata), [recordOf("needs_validation", "fp-1")]);

    it("a baseline of the same shape is met", () => {
      expect(verdictOf("quick", honest(verified({})))).toEqual({ result: "met" });
    });

    it.each([
      ["a verifier recorded on a unit with no wave", honest(verified({ wave: null }))],
      ["a verifier recorded on a unit with wave 0", honest(verified({ wave: 0 }))],
      ["a verifier recorded on a unit nobody owns", honest(verified({ agent_id: null }))],
      ["an archived attempt as late as the unit's own wave", honest(verified({ attempts: [{ wave: 1, agent_id: "h0" }], wave: 1 }))],
      ["archived attempts out of order", honest(verified({ attempts: [{ wave: 2, agent_id: "h0" }, { wave: 1, agent_id: "h9" }], wave: 3 }))],
      ["a critic pass after a hunter wave that never ran", honest(verified({}), { critic_passes: [{ wave: 4, accepted: 0 }] })],
    ] as const)("%s", (_name, files) => {
      expect(verdictOf("quick", files)).toEqual({ result: "unmet" });
    });
  });
});
