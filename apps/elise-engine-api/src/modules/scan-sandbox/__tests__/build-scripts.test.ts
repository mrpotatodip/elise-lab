import { describe, expect, it } from "vitest";
import type { ScanOptions } from "#/schemas";
import { RUNNER_PROMPT_PLACE } from "#/modules/runners/constants";
import { SCAN_SANDBOX_FULL_PHASES, SCAN_SANDBOX_PHASE_SKILL_PHASES } from "#/modules/scan-sandbox/constants";
import { buildAgentPrompt, buildAgentScript, buildCloneScript, buildPhasePrompt, phaseAgentFiles } from "#/modules/scan-sandbox/utils";

const options: ScanOptions = { skill: "full", model: "claude-haiku-5-5", effort: "low", profile: "quick", maxBudgetUsd: 1 };

const sharedLines = (text: string) => text.split("\n").filter((line) => !/^(Target|Output directory|The money|Do not use the network|There is no network)/.test(line));

describe("buildAgentScript", () => {
  it("takes an atomic lock first, so a retry starts no second agent", () => {
    const script = buildAgentScript(options);

    expect(script.startsWith("mkdir /workspace/agent.lock 2>/dev/null || exit 0")).toBe(true);
  });

  it("writes the exit code to a temp file, then renames it", () => {
    const script = buildAgentScript(options);

    expect(script).toContain("echo $? > /workspace/agent.exit.tmp && mv /workspace/agent.exit.tmp /workspace/agent.exit");
  });

  it("passes the model, the effort and the dollar cap", () => {
    const script = buildAgentScript(options);

    expect(script).toContain("--model claude-haiku-5-5 --effort low --max-budget-usd 1");
  });

  it("gives a Phase its own prompt, log, exit file and lock, and what the pool still holds as the cap", () => {
    const script = buildAgentScript({ ...options, skill: "full" }, phaseAgentFiles("hunt"), 1.25);

    expect(script.startsWith("mkdir /workspace/agent-hunt.lock 2>/dev/null || exit 0")).toBe(true);
    expect(script).toContain("--max-budget-usd 1.25");
    expect(script).toContain('"$(cat /workspace/prompt-hunt.txt)"');
    expect(script).toContain("> /workspace/agent-hunt.log 2> /workspace/agent-hunt.err");
    expect(script).toContain("echo $? > /workspace/agent-hunt.exit.tmp && mv /workspace/agent-hunt.exit.tmp /workspace/agent-hunt.exit");
    expect(script).not.toContain("/workspace/agent.");
  });

  it("gives no two Phases a file in common, so a later one never reads the exit code of an earlier one", () => {
    const files = SCAN_SANDBOX_FULL_PHASES.flatMap((phase) => Object.values(phaseAgentFiles(phase)));

    expect(new Set(files).size).toBe(files.length);
  });

  it("ignores the clone's own Claude config", () => {
    const script = buildAgentScript(options);

    expect(script).toContain("--setting-sources user");
    expect(script).toContain("rm -rf /workspace/repo/.claude /workspace/repo/CLAUDE.md");
  });
});

describe("buildCloneScript", () => {
  it("kills a slow clone and takes the URL as an argument, not as script text", () => {
    const script = buildCloneScript();

    expect(script).toContain("timeout --kill-after=5 300 git clone --depth 1 -- \"$1\"");
    expect(script).not.toContain("github.com");
  });

  it("fetches a ref given as the second argument, never as script text, and writes the commit it read", () => {
    const script = buildCloneScript();

    expect(script).toContain("git fetch --depth 1 origin \"$2\"");
    expect(script).toContain("git fetch --depth 1 origin \"refs/heads/$2\"");
    expect(script).toContain("echo branch > /workspace/repo.kind");
    expect(script).toContain("echo other > /workspace/repo.kind");
    expect(script).toContain("rev-parse --abbrev-ref HEAD > /workspace/repo.branch");
    expect(script).toContain("rev-parse HEAD > /workspace/repo.sha");
    expect(script.startsWith("set -e;")).toBe(true);
  });
});

describe("buildAgentPrompt", () => {
  it.each(["lite", "full"] as const)("names the full skill and the profile whatever the options' skill (%s), and sets no count of agents", (skill) => {
    const prompt = buildAgentPrompt({ ...options, skill, profile: "deep" });

    expect(prompt).toContain("security-audit skill in FULL AUDIT mode");
    expect(prompt).not.toContain("security-audit-lite");
    expect(prompt).toContain("Profile: deep");
    expect(prompt).not.toContain("agent invocations");
  });

  it.each([
    ["recon", "Phase 1 (Reconnaissance)", "This is the first run"],
    ["hunt", "Phase 2 (Coverage-led hunting waves)", "Do not redo reconnaissance"],
    ["check", "Phases 3, 4 and 5", "Do not hunt again"],
    ["report", "Phase 6 (Target-neutral report)", "Do not hunt or validate again"],
  ] as const)("tells the %s run which part of the skill it does and what the earlier runs left", (phase, skillPhases, handoff) => {
    const prompt = buildPhasePrompt({ ...options, skill: "full", profile: "deep" }, phase);

    expect(prompt).toContain("security-audit skill in FULL AUDIT mode");
    expect(prompt).toContain(`This run does ${skillPhases}`);
    expect(prompt).toContain(handoff);
    expect(prompt).toContain("Profile: deep");

    // -----
    // The same Phase for a Runner's place: it does only its own part, tells the agent to
    // stop, forbids neither sub-agents nor node commands, carries no money sentence, and
    // differs from the cloud's only in the paths, the network rule, who runs the validators
    // and that sentence.
    // -----
    const onRunner = buildPhasePrompt({ ...options, skill: "full", profile: "deep" }, phase, RUNNER_PROMPT_PLACE);
    const otherParts = Object.entries(SCAN_SANDBOX_PHASE_SKILL_PHASES).filter(([other]) => other !== phase);

    expect(onRunner).toContain(`This run does ${skillPhases}`);
    expect(otherParts.filter(([, part]) => onRunner.includes(part))).toEqual([]);
    expect(onRunner).toContain("so stop when yours is done");
    expect(onRunner).toContain("./repo");
    expect(onRunner).not.toMatch(/sub-?agent|node command|money|deferred/i);
    expect(sharedLines(onRunner).slice(0, 5)).toEqual(sharedLines(prompt).slice(0, 5));
  });

  it("has only the check and report runs validate, and only the report run write the report files", () => {
    const full: ScanOptions = { ...options, skill: "full" };

    expect(buildPhasePrompt(full, "recon")).not.toContain("validators");
    expect(buildPhasePrompt(full, "hunt")).not.toContain("validators");
    expect(buildPhasePrompt(full, "check")).toContain("run the skill's validators");
    expect(buildPhasePrompt(full, "check")).toContain("Do not write the report files in this run");
    expect(buildPhasePrompt(full, "report")).toContain("Finish by producing REPORT.md");
  });

  it("tells every run but the report to write down what it did not reach when its money runs out", () => {
    const full: ScanOptions = { ...options, skill: "full" };

    expect(buildPhasePrompt(full, "hunt")).toContain("record every unit you did not reach as deferred");
    expect(buildPhasePrompt(full, "report")).not.toContain("deferred");
  });

  it("has the agent run the validators in the container and the app run them on a Runner", () => {
    const full: ScanOptions = { ...options, skill: "full" };
    const onRunner = buildAgentPrompt(full, RUNNER_PROMPT_PLACE);

    expect(buildAgentPrompt(full)).toContain("run the skill's validators");
    expect(onRunner).toContain("Do not run the validators or any node command");
    expect(onRunner).not.toContain("run the skill's validators");
  });
});
