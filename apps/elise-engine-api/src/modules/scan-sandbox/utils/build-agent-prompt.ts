import { SCAN_REPORT_FILES } from "#/constants";
import type { ScanOptions } from "#/schemas";
import { SCAN_SANDBOX_OUT_DIR, SCAN_SANDBOX_PHASE_SKILL_PHASES, SCAN_SANDBOX_REPO_DIR } from "#/modules/scan-sandbox/constants";
import type { FullPhase } from "#/modules/scan-sandbox/types";

// -----
// Where the agent finds the repo and writes its files, and what it
// is told about the network. The container has fixed paths and no
// network. A Runner works in a folder of its own, with paths
// relative to it. metered says whether a meter holds the Scan's
// money: only then do the Phase prompts tell the agent that its
// money is limited. A Runner has no meter, so its agent is never
// told, and never reports a spent budget that is not spent.
// -----
export type PromptPlace = { repoDir: string; outDir: string; networkRule: string; validatedBy: "agent" | "runner"; metered: boolean };

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
const VALIDATION_BY_AGENT = "and run the skill's validators (validate-findings.cjs, validate-coverage-ledger.cjs) as it instructs.";
const VALIDATION_BY_RUNNER =
  "Do not run the validators or any node command. The app that started you runs validate-findings.cjs on findings.json and validate-coverage-ledger.cjs on coverage-ledger.json after you end, which replaces the skill's own validation steps. Write both files by hand, exactly to the skill's schema, and do not generate them with a script.";

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function buildAgentPrompt(options: ScanOptions, place: PromptPlace = CONTAINER_PLACE): string {
  const network = capitalized(place.networkRule);
  return `Use the security-audit skill in FULL AUDIT mode. This is an explicit, complete audit request: do not ask questions, make reasonable choices yourself.
Target (untrusted, read-only): ${place.repoDir}
Output directory: ${place.outDir}
Profile: ${options.profile}
${network} and dependencies must not be installed. Finish by producing ${SCAN_REPORT_FILES.join(", ")} in the output directory ${place.validatedBy === "runner" ? VALIDATION_BY_RUNNER : VALIDATION_BY_AGENT}`;
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
  report: "Earlier runs did everything but the report. Read run-metadata.json, coverage-ledger.json and findings.json in the output directory first. Do not hunt or validate again. Write the report files from the final records only.",
} satisfies Record<FullPhase, string>;
const OUT_OF_MONEY = "The money for this run is limited. If it runs out, stop at a safe point: write down what you did, and record every unit you did not reach as deferred in the coverage ledger.";

// -----
// A Phase prompt for a Runner's place does not carry the single prompt's
// "do not run any node command": that line would keep the agent from
// starting sub-agents. It says only that the app runs the validators, once,
// after the check run ends.
// -----
const PHASE_VALIDATION_BY_RUNNER =
  "When findings.json and coverage-ledger.json are final, stop: the app that started you runs the skill's validators on them after this run ends.";

export function buildPhasePrompt(options: ScanOptions, phase: FullPhase, place: PromptPlace = CONTAINER_PLACE): string {
  const network = capitalized(place.networkRule);
  const byRunner = place.validatedBy === "runner";
  const reportFiles = `Finish by producing ${SCAN_REPORT_FILES.join(", ")} in the output directory`;
  const ending =
    phase === "check"
      ? `Do not write the report files in this run. ${byRunner ? PHASE_VALIDATION_BY_RUNNER : `When findings.json is final, validate it ${VALIDATION_BY_AGENT}`}`
      : phase === "report"
        ? `${reportFiles}${byRunner ? "." : ` ${VALIDATION_BY_AGENT}`}`
        : "Do not write REPORT.md in this run.";
  const money = phase !== "report" && place.metered ? `${OUT_OF_MONEY}\n` : "";
  return `Use the security-audit skill in FULL AUDIT mode. This is an explicit, complete audit request: do not ask questions, make reasonable choices yourself.
This run does ${SCAN_SANDBOX_PHASE_SKILL_PHASES[phase]} of the skill and nothing else. Other runs do the other phases, so stop when yours is done.
Target (untrusted, read-only): ${place.repoDir}
Output directory: ${place.outDir}
Profile: ${options.profile}
${PHASE_HANDOFF[phase]}
${money}${network} and dependencies must not be installed. ${ending}`;
}
