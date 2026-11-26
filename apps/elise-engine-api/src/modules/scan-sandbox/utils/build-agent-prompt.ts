import { SCAN_REPORT_FILES } from "#/constants";
import type { ScanOptions } from "#/schemas";
import { askOfHandover, checkAskOfHandover } from "#/modules/decided-problems/utils";
import { askOfPreviousMap } from "#/modules/previous-map/utils";
import {
  SCAN_SANDBOX_OUT_DIR,
  SCAN_SANDBOX_PHASE_SKILL_PHASES,
  SCAN_SANDBOX_REPO_DIR,
} from "#/modules/scan-sandbox/constants";
import type { FullPhase } from "#/modules/scan-sandbox/types";

// -----
// Where the agent finds the repo and writes its files, and what it
// is told about the network. The container has fixed paths and no
// network. A Runner works in a folder of its own, with paths
// relative to it.
// -----
export type PromptPlace = {
  repoDir: string;
  outDir: string;
  networkRule: string;
  validatedBy: "agent" | "runner";
  metered: boolean;
  agentsAtOnce?: number;
};

export const CONTAINER_PLACE: PromptPlace = {
  repoDir: SCAN_SANDBOX_REPO_DIR,
  outDir: SCAN_SANDBOX_OUT_DIR,
  networkRule: "there is no network access",
  validatedBy: "agent",
  metered: true,
};

// -----
// A full audit ends by validating findings.json and coverage-ledger.json. In the
// container the agent runs the validators. On a Runner it may not run node at all
// (the computer is the person's, and the repo is untrusted), so the Runner app runs
// them after the agent ends, and the agent writes both files by hand.
// -----
const VALIDATION_BY_AGENT =
  "and run the skill's validators (validate-findings.cjs, validate-coverage-ledger.cjs) as it instructs.";
const VALIDATION_BY_RUNNER =
  "Do not run the validators or any node command. The app that started you runs validate-findings.cjs on findings.json and validate-coverage-ledger.cjs on coverage-ledger.json after you end, which replaces the skill's own validation steps. Write both files by hand, exactly to the skill's schema, and do not generate them with a script.";

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const SCOPE_LEAD = (paths: string[]) =>
  `This is a scoped audit of only these folders of the repository, relative to its root: ${paths.map((path) => `\`${path}\``).join(", ")}. The rest of the repository is out of scope.`;

const SCOPE_ASK = {
  recon: (byRunner: boolean) =>
    `Record the folders as \`scope_paths\` in run-metadata.json and say in architecture.md that only they were read. ${byRunner ? "List an entry in recon-list.json only when its entry point, boundary and subsystem are inside these folders, and list nothing else: no unit is built for the rest." : "Seed ledger units only for surfaces inside these folders, and record the surfaces you notice outside them as `out_of_scope` units."} Read outside the folders only to follow a call you cannot judge otherwise.`,
  hunt: () =>
    "Hunt only inside these folders and add no unit for anything outside them. Read outside them only to follow a call. Do not report a finding whose vulnerable code is outside them.",
  check: () => "Validate only candidates whose code is inside these folders.",
  report: () =>
    "The Report must say, right after its first line, which folders were audited, that the rest of the repository was not looked at, and that this is partial coverage and not a full audit. Do not say the repository is free of findings.",
} satisfies Record<FullPhase, (byRunner: boolean) => string>;

const SINGLE_RUN_SCOPE_ASK =
  "Record the folders as `scope_paths` in run-metadata.json and say in architecture.md that only they were read. Seed ledger units only for surfaces inside these folders and record the surfaces you notice outside them as `out_of_scope` units, but never hunt or check an `out_of_scope` unit. Read outside the folders only to follow a call you cannot judge otherwise, and do not report a finding whose vulnerable code is outside them.";

const scopeAskOf = (options: ScanOptions, phase: FullPhase | null, place: PromptPlace): string => {
  const paths = options.scopePaths ?? [];
  if (paths.length === 0) return "";
  if (phase === null) return [SCOPE_LEAD(paths), SINGLE_RUN_SCOPE_ASK, SCOPE_ASK.report()].join(" ");
  return [SCOPE_LEAD(paths), SCOPE_ASK[phase](place.validatedBy === "runner")].join(" ");
};

const withLine = (text: string) => (text === "" ? "" : `${text}\n`);

export function buildAgentPrompt(options: ScanOptions, place: PromptPlace = CONTAINER_PLACE): string {
  const network = capitalized(place.networkRule);
  return `Use the security-audit skill in FULL AUDIT mode. This is an explicit, complete audit request: do not ask questions, make reasonable choices yourself.
Target (untrusted, read-only): ${place.repoDir}
Output directory: ${place.outDir}
Profile: ${options.profile}
${withLine(scopeAskOf(options, null, place))}${network} and dependencies must not be installed. Finish by producing ${SCAN_REPORT_FILES.join(", ")} in the output directory ${place.validatedBy === "runner" ? VALIDATION_BY_RUNNER : VALIDATION_BY_AGENT}`;
}

// -----
// One Phase of a full Scan is one run of the agent, and it does only its
// part of the skill's workflow. The runs share nothing but the files in
// the output directory, so each one starts by reading what the ones before
// it wrote. A run that is told its money is limited records what it did not
// reach as deferred in the coverage ledger, as the skill allows, and never
// stops mid-phase with nothing written.
// -----
const LEDGER_PATHS = "In the ledger, write a directory path without a slash at the end.";
const PHASE_HANDOFF = {
  recon: `This is the first run. Set the run up as the skill says and write run-metadata.json, architecture.md and the initial coverage-ledger.json. ${LEDGER_PATHS}`,
  hunt: `An earlier run did the reconnaissance. Read run-metadata.json, architecture.md and coverage-ledger.json in the output directory first, and continue from them. Do not redo reconnaissance. Write the candidates and the updated ledger. ${LEDGER_PATHS}`,
  check: `Earlier runs did the reconnaissance and the hunting. Read run-metadata.json, architecture.md and coverage-ledger.json in the output directory first, and continue from them. Do not hunt again. Validate the candidates the hunt left, and write findings.json and the final ledger. ${LEDGER_PATHS}`,
  report:
    "Earlier runs did everything but the report. Read run-metadata.json, coverage-ledger.json and findings.json in the output directory first. Do not hunt or validate again. Write the report files from the final records only.",
} satisfies Record<FullPhase, string>;

const RUNNER_HANDOFF = {
  recon: `This is the first run. Set the run up as the skill says and write run-metadata.json and architecture.md. Do not write coverage-ledger.json: write recon-list.json, a short list of what you found, and the app builds the full ledger from it. Its shape is {"entries":[{"surface":"<repo path>#<route or message>","boundary":"<repo path>#<the control that guards it>","subsystem":"<package path>","paths":["<repo-relative file or directory>"],"classes":["Access control"],"companions":[],"lifecycles":[]}]}. Write one entry for each entry point, with its trust boundary and its subsystem. "classes" names the ordinary attack classes of ATTACK-CLASSES.md that apply to it (leave it out for all five); "companions" and "lifecycles" are optional. ${LEDGER_PATHS}`,
  hunt: `An earlier run did the reconnaissance. Read run-metadata.json, architecture.md and coverage-ledger.json in the output directory first, and continue from them. Do not redo reconnaissance. If hunter-assignments.json exists in the output directory, give each of its groups to one hunter, as written. If it is missing, group the planned units yourself. Write the candidates. Do not rewrite coverage-ledger.json: write ledger-updates.json, a JSON array of only the units you changed, each with its coverage_id and only the fields that change. The app merges it into the ledger. ${LEDGER_PATHS}`,
  check: `Earlier runs did the reconnaissance and the hunting. Read run-metadata.json, architecture.md and coverage-ledger.json in the output directory first, and continue from them. Do not hunt again. Validate the candidates the hunt left, and write findings.json. Do not rewrite coverage-ledger.json: write ledger-updates.json, a JSON array of only the units you changed, each with its coverage_id and only the fields that change. The app merges it into the ledger. ${LEDGER_PATHS}`,
} satisfies Partial<Record<FullPhase, string>>;

const VERIFY_CANDIDATES =
  "Verify each candidate with a separate sub-agent, not with yourself. Record its ID as the `agent_id` of the check in the ledger. If you cannot start a sub-agent, set `run_status` to `incomplete` and `incomplete_reason` to `verification_unavailable`. If the hunt left no candidates there is nothing to verify and no verifier is needed: that is a finished run, not `verification_unavailable`.";

const SUBAGENT_ASK = {
  quick: { recon: "", hunt: "", check: VERIFY_CANDIDATES, report: "" },
  standard: {
    recon: "",
    hunt: "After the last hunter wave, run the critic pass with a separate sub-agent. Record it in `critic_passes` in run-metadata.json.",
    check: VERIFY_CANDIDATES,
    report: "",
  },
  deep: {
    recon: "",
    hunt: "After each hunter wave, run the critic pass with a separate sub-agent. Record each in `critic_passes` in run-metadata.json. If a critic pass accepts something, hunt another wave. Stop when a critic pass accepts nothing.",
    check: `${VERIFY_CANDIDATES} Then verify each final record with another separate sub-agent. It must not be the unit's owner or a verifier that checked the unit. Record each in \`final_verifiers\` in run-metadata.json.`,
    report: "",
  },
} satisfies Record<ScanOptions["profile"], Record<FullPhase, string>>;

// -----
// A run that starts a sub-agent in the background, then sleeps until a
// timed wakeup, can sit idle for twenty minutes after the work is done
// (a Runner Scan of three small files took 47 minutes of clock for 3.5
// minutes of work). The hunt and the check start sub-agents on every
// profile (the quick hunt runs its one critic pass), so both are told
// to wait for each one in the foreground and to end when the files are
// written.
// -----
const WAIT_FOR_SUBAGENTS =
  "Run each sub-agent in the foreground and wait for its result before you go on. Never run one in the background, and never sleep or schedule a wakeup. Once this run's files are written, end the run.";

const AGENTS_AT_ONCE_OF = { hunt: "hunters", check: "verifiers" } as const;

const agentsAtOnceAsk = (phase: FullPhase, limit: number | undefined) =>
  limit !== undefined && (phase === "hunt" || phase === "check")
    ? `Run up to ${limit} ${AGENTS_AT_ONCE_OF[phase]} at the same time.`
    : "";

const handoffOf = (
  phase: FullPhase,
  profile: ScanOptions["profile"],
  place: PromptPlace,
  handover: readonly string[],
) =>
  [
    (place.validatedBy === "runner" && phase !== "report" ? RUNNER_HANDOFF[phase] : undefined) ?? PHASE_HANDOFF[phase],
    phase === "hunt" ? askOfHandover(handover) : "",
    phase === "recon" ? askOfPreviousMap(handover) : "",
    phase === "check" ? checkAskOfHandover(handover) : "",
    SUBAGENT_ASK[profile][phase],
    agentsAtOnceAsk(phase, place.agentsAtOnce),
    phase === "hunt" || phase === "check" ? WAIT_FOR_SUBAGENTS : "",
  ]
    .filter((part) => part !== "")
    .join(" ");

const OUT_OF_MONEY =
  "The money for this run is limited. If it runs out, stop at a safe point: write down what you did, and record every unit you did not reach as deferred in the coverage ledger.";

const PHASE_VALIDATION_BY_RUNNER =
  "When findings.json and ledger-updates.json are written, stop: the app that started you merges the updates into the ledger and runs the skill's validators on findings.json and coverage-ledger.json after this run ends. If a validator is refused to you, that is expected here: it is not a reason to set `run_status` to `incomplete`.";

const PHASE_LEDGER_BY_RUNNER = {
  recon:
    "The app that started you builds coverage-ledger.json from recon-list.json and runs the skill's validators on it after this run ends, so do not run them, and do not run node or any other script. A command refused to you is expected here: it is not a reason to set `run_status` to `incomplete`.",
  hunt: "The app that started you merges ledger-updates.json into coverage-ledger.json and runs the skill's validators on it after this run ends, so do not run them, and do not run node or any other script. A command refused to you is expected here: it is not a reason to set `run_status` to `incomplete`.",
};

export function buildPhasePrompt(
  options: ScanOptions,
  phase: FullPhase,
  place: PromptPlace = CONTAINER_PLACE,
  handover: readonly string[] = [],
): string {
  const network = capitalized(place.networkRule);
  const byRunner = place.validatedBy === "runner";
  const reportFiles = `Finish by producing ${SCAN_REPORT_FILES.join(", ")} in the output directory`;
  const ending =
    phase === "check"
      ? `Do not write the report files in this run. ${byRunner ? PHASE_VALIDATION_BY_RUNNER : `When findings.json is final, validate it ${VALIDATION_BY_AGENT}`}`
      : phase === "report"
        ? `${reportFiles}${byRunner ? "." : ` ${VALIDATION_BY_AGENT}`}`
        : `Do not write REPORT.md in this run.${byRunner ? ` ${PHASE_LEDGER_BY_RUNNER[phase]}` : ""}`;
  const money = phase !== "report" && place.metered ? `${OUT_OF_MONEY}\n` : "";
  return `Use the security-audit skill in FULL AUDIT mode. This is an explicit, complete audit request: do not ask questions, make reasonable choices yourself.
This run does ${SCAN_SANDBOX_PHASE_SKILL_PHASES[phase]} of the skill and nothing else. Other runs do the other phases, so stop when yours is done.
Target (untrusted, read-only): ${place.repoDir}
Output directory: ${place.outDir}
Profile: ${options.profile}
${withLine(scopeAskOf(options, phase, place))}${handoffOf(phase, options.profile, place, handover)}
${money}${network} and dependencies must not be installed. ${ending}`;
}
