import { Files } from "@cloudflare/sandbox";
import { DurableObject } from "cloudflare:workers";
import type { ScanUsage, TraceEntry } from "@repo/contracts/elise";
import { SCAN_REPORT_FILES } from "#/constants";
import type { ScanFiles } from "#/lib/scan-file-types";
import type { ScanOptions } from "#/schemas";
import type { Bindings } from "#/types/variables";
import { normalizeBranchName } from "#/modules/branches";
import { canonicalRepo } from "#/modules/scan-ledger";
import {
  SCAN_SANDBOX_AGENT_ENV,
  SCAN_SANDBOX_BRANCH_FILE,
  SCAN_SANDBOX_CLONE_GUARD_MS,
  SCAN_SANDBOX_CLONED_MARKER,
  SCAN_SANDBOX_COMMIT_FILE,
  SCAN_SANDBOX_INACTIVITY_MS,
  SCAN_SANDBOX_INSTANCE_TYPE,
  SCAN_SANDBOX_KIND_FILE,
  SCAN_SANDBOX_LOG_READ_BYTES,
  SCAN_SANDBOX_LOG_TAIL_CHARS,
  SCAN_SANDBOX_METER_KEY,
  SCAN_SANDBOX_OUT_DIR,
  SCAN_SANDBOX_PHASES_KEY,
  SCAN_SANDBOX_PROMPT_PATH,
  SCAN_SANDBOX_REPO_DIR,
  SCAN_SANDBOX_TRACE_KEY,
  SCAN_SANDBOX_TRUST_ENV,
  SCAN_SANDBOX_WORK_DIR,
} from "#/modules/scan-sandbox/constants";
import { drainTrace as drainLog, emptyTraceState, phaseMarker, type TraceState } from "#/modules/scan-trace/utils";
import type { AgentState, FullPhase, Meter, MeteredTokens, OutboundAnthropicKey, OutboundExport, OutboundGithub, ScanCheckout } from "#/modules/scan-sandbox/types";
import {
  agentErrorText,
  buildAgentPrompt,
  buildAgentScript,
  buildCloneScript,
  buildPhasePrompt,
  DEFAULT_AGENT_FILES,
  freshMeter,
  parseAgentUsage,
  phaseAgentFiles,
  priceUsage,
  remainingUsd,
  sumOrNull,
  withReserve,
  withoutReserve,
  type AgentFiles,
} from "#/modules/scan-sandbox/utils";

type SandboxContext = DurableObjectState & { exports: { Outbound: OutboundExport } };

type StoredTrace = TraceState & { phase: FullPhase; pending: TraceEntry[]; ended: boolean };

// -----
// The Sandbox of a Scan: one Durable Object and the container it starts
// from its own Image (wrangler.jsonc, Dockerfile.full), used for exactly
// one Scan. A Scan that is running keeps this class, so never rename it.
// -----
export class FullScanSandbox extends DurableObject<Bindings> {
  readonly #container: NonNullable<DurableObjectState["container"]>;
  readonly #files: Files;
  readonly #context: SandboxContext;

  constructor(ctx: SandboxContext, env: Bindings) {
    super(ctx, env);
    if (!ctx.container) throw new Error("The container binding is not configured");
    this.#container = ctx.container;
    this.#files = new Files(ctx.container);
    this.#context = ctx;
  }

  // -----
  // The meter. Outbound reserves the cost of the largest possible
  // answer before each model call, gives it back when the call ends
  // and reports what came back, so the cap and the recorded cost
  // come from here, not from a file the container can write. Calls
  // in parallel each hold a reserve, so together they cannot pass
  // the cap. Nothing awaits between the read and the write, so two
  // calls never both see the same room.
  // -----
  async meterReserve(usd: number): Promise<boolean> {
    const meter = await this.ctx.storage.get<Meter>(SCAN_SANDBOX_METER_KEY);
    if (meter === undefined) return false;
    const reserved = withReserve(meter, usd);
    if (reserved === null) {
      await this.ctx.storage.put<Meter>(SCAN_SANDBOX_METER_KEY, { ...meter, refused: true });
      return false;
    }
    await this.ctx.storage.put<Meter>(SCAN_SANDBOX_METER_KEY, reserved);
    return true;
  }

  async meterRelease(usd: number): Promise<void> {
    const meter = await this.ctx.storage.get<Meter>(SCAN_SANDBOX_METER_KEY);
    if (meter === undefined) return;
    await this.ctx.storage.put<Meter>(SCAN_SANDBOX_METER_KEY, withoutReserve(meter, usd));
  }

  async meterRecord(model: string, tokens: MeteredTokens): Promise<void> {
    const meter = await this.ctx.storage.get<Meter>(SCAN_SANDBOX_METER_KEY);
    if (meter === undefined) return;
    await this.ctx.storage.put<Meter>(SCAN_SANDBOX_METER_KEY, {
      ...meter,
      inputTokens: meter.inputTokens + tokens.inputTokens,
      outputTokens: meter.outputTokens + tokens.outputTokens,
      cacheReadTokens: meter.cacheReadTokens + tokens.cacheReadTokens,
      cacheWriteTokens: meter.cacheWriteTokens + tokens.cacheWriteTokens,
      spentUsd: meter.spentUsd + priceUsage(model, tokens),
    });
  }

  // -----
  // Clones the repo (at the ref, if one was asked for) and
  // returns the commit that was read, and the branch when it
  // was one: git's own answer for a plain clone, the ref when
  // it was fetched as a branch, nothing for a tag or a commit. A second call after a
  // retry finds the marker and returns the same commit.
  // -----
  async prepare(repoUrl: string, ref?: string, github?: OutboundGithub, anthropicKey?: OutboundAnthropicKey): Promise<ScanCheckout> {
    console.log("scan: starting container");
    await this.#start(canonicalRepo(repoUrl), github, anthropicKey);
    if ((await this.#readText(SCAN_SANDBOX_CLONED_MARKER)) === null) {
      console.log("scan: cloning", repoUrl, ref ?? "");
      await this.#sh(buildCloneScript(), ref ? [repoUrl, ref] : [repoUrl], SCAN_SANDBOX_CLONE_GUARD_MS);
      await this.#files.writeFile(SCAN_SANDBOX_CLONED_MARKER, "ok");
    }
    const commitSha = (await this.#readText(SCAN_SANDBOX_COMMIT_FILE))?.trim() || null;
    if (ref) return { commitSha, branch: (await this.#readText(SCAN_SANDBOX_KIND_FILE))?.trim() === "branch" ? ref : null };
    return { commitSha, branch: normalizeBranchName((await this.#readText(SCAN_SANDBOX_BRANCH_FILE)) ?? "") };
  }

  // -----
  // One run of the agent for the whole Scan, with the whole Budget cap.
  // A Scan in our cloud runs in Phases (launchPhase). The one-run branch
  // of runScan is reached only by a Scan on a Runner, which has its own
  // sandbox; this stays because SandboxPort asks every sandbox for it, and
  // a Durable Object stub fails at run time on a method it lacks.
  // -----
  async launchAgent(options: ScanOptions): Promise<void> {
    console.log("scan: running agent", options);
    await this.#openMeter(options.maxBudgetUsd);
    await this.#files.writeFile(SCAN_SANDBOX_PROMPT_PATH, buildAgentPrompt(options));
    await this.#container.exec(["/bin/sh", "-c", buildAgentScript(options)], {
      cwd: SCAN_SANDBOX_REPO_DIR,
      env: SCAN_SANDBOX_AGENT_ENV,
      stdout: "ignore",
      stderr: "ignore",
    });
  }

  // -----
  // Starts one Phase of a full Scan: opens the meter with the whole
  // Budget cap if this is the first Phase, notes that the Phase started,
  // and runs the agent on that Phase's prompt and files. The agent's own
  // cap is what the pool still holds. A retried launch changes nothing:
  // the meter is already open and the Phase is already noted.
  // -----
  async launchPhase(options: ScanOptions, phase: FullPhase): Promise<void> {
    const meter = await this.#openMeter(options.maxBudgetUsd);
    const started = await this.#startedPhases();
    if (!started.includes(phase)) {
      const trace: StoredTrace = { ...emptyTraceState(), phase, pending: [phaseMarker("phase_started", phase, new Date())], ended: false };
      await this.ctx.storage.put({ [SCAN_SANDBOX_PHASES_KEY]: [...started, phase], [SCAN_SANDBOX_TRACE_KEY]: trace });
    }
    const remaining = remainingUsd(meter);
    console.log(`scan: phase ${phase} starts, $${remaining.toFixed(4)} of the $${options.maxBudgetUsd} cap left`);
    // -----
    // A Phase that ended well can still have spent the whole pool. The
    // next one could make no call, and `--max-budget-usd 0` is not a run.
    // -----
    if (Number(remaining.toFixed(6)) <= 0) {
      throw new Error(`the budget cap of $${options.maxBudgetUsd} was reached before the ${phase} phase could start`);
    }
    const files = phaseAgentFiles(phase);
    await this.#files.writeFile(files.prompt, buildPhasePrompt(options, phase));
    await this.#container.exec(["/bin/sh", "-c", buildAgentScript(options, files, Number(remaining.toFixed(6)))], {
      cwd: SCAN_SANDBOX_REPO_DIR,
      env: SCAN_SANDBOX_AGENT_ENV,
      stdout: "ignore",
      stderr: "ignore",
    });
  }

  // -----
  // Whether the meter turned a model call away: the Scan spent its whole
  // Budget cap. A Phase that ends with an error after that did not fail
  // by itself, it ran out of money.
  // -----
  async capReached(): Promise<boolean> {
    return (await this.ctx.storage.get<Meter>(SCAN_SANDBOX_METER_KEY))?.refused === true;
  }

  async pollAgent(): Promise<AgentState> {
    if (!this.#container.running) return { state: "failed", error: "the container stopped before the agent finished" };
    const exitCode = (await this.#readText((await this.#currentFiles()).exit))?.trim();
    if (!exitCode) return { state: "running" };
    if (exitCode === "0") return { state: "succeeded" };
    return { state: "failed", error: `claude exited ${exitCode}: ${await this.agentLogTail()}` };
  }

  // -----
  // The Trace entries of the running Phase: its start marker, then the
  // entries its log gave since the last call (read from the saved byte
  // offset, so a retry never repeats a line), then its end marker once
  // `ended`. The state is saved before the entries are handed back, so
  // a failed write on the Workflow's side drops entries and never
  // repeats them. An entry that grew comes back whole under its own id.
  // -----
  async drainTrace(ended: boolean): Promise<TraceEntry[]> {
    const stored = await this.ctx.storage.get<StoredTrace>(SCAN_SANDBOX_TRACE_KEY);
    if (stored === undefined) return [];
    const now = new Date();
    const chunk = stored.ended ? "" : await this.#logFrom(phaseAgentFiles(stored.phase).log, stored.offset);
    const drained = drainLog({ offset: stored.offset, open: stored.open }, chunk, stored.phase, now);
    const entries = [...stored.pending, ...drained.entries];
    if (ended && !stored.ended) entries.push(phaseMarker("phase_ended", stored.phase, now));
    await this.ctx.storage.put<StoredTrace>(SCAN_SANDBOX_TRACE_KEY, { ...drained.state, phase: stored.phase, pending: [], ended: stored.ended || ended });
    return entries;
  }

  async agentLogTail(): Promise<string> {
    const files = await this.#currentFiles();
    const log = (await this.#logEnd(files.log)) ?? "";
    const err = (await this.#readText(files.err))?.trim();
    const text = agentErrorText(log, SCAN_SANDBOX_LOG_TAIL_CHARS) || "(no agent log)";
    return `${err ? `${err.slice(-SCAN_SANDBOX_LOG_TAIL_CHARS)} ` : ""}${text}`;
  }

  // -----
  // Turns and duration come from the agent's own report, one for each
  // run, and add up over a full Scan's Phases. Cost and tokens come from
  // the meter, which already holds the whole Scan.
  // -----
  async readUsage(): Promise<ScanUsage | null> {
    const meter = await this.ctx.storage.get<Meter>(SCAN_SANDBOX_METER_KEY);
    const started = await this.#startedPhases();
    const logs = await Promise.all((started.length > 0 ? started.map((phase) => phaseAgentFiles(phase)) : [DEFAULT_AGENT_FILES]).map((files) => this.#logEnd(files.log)));
    const reports = logs.flatMap((log) => (log === null ? [] : [parseAgentUsage(log)])).filter((report) => report !== null);
    const reported = reports.length === 0 ? null : { ...reports[0], turns: sumOrNull(reports.map((report) => report.turns)), durationMs: sumOrNull(reports.map((report) => report.durationMs)) };
    if (meter === undefined) return reported;
    return {
      inputTokens: meter.inputTokens,
      outputTokens: meter.outputTokens,
      cacheReadTokens: meter.cacheReadTokens,
      cacheWriteTokens: meter.cacheWriteTokens,
      costUsd: meter.spentUsd,
      turns: reported?.turns ?? null,
      durationMs: reported?.durationMs ?? null,
    };
  }

  async readCheckout(): Promise<ScanCheckout | null> {
    return null;
  }

  async readFiles(): Promise<ScanFiles> {
    console.log("scan: reading deliverables");
    const files: ScanFiles = {};
    for (const name of SCAN_REPORT_FILES) {
      const text = await this.#readText(`${SCAN_SANDBOX_OUT_DIR}/${name}`);
      if (text !== null) files[name] = text;
    }
    if (files["REPORT.md"] === undefined) {
      throw new Error(`the audit finished without writing REPORT.md. ${await this.agentLogTail()}`);
    }
    return files;
  }

  async destroy(): Promise<void> {
    console.log("scan: destroying container");
    if (this.#container.running) await this.#container.destroy();
    await this.ctx.storage.deleteAll();
  }

  async #startedPhases(): Promise<FullPhase[]> {
    return (await this.ctx.storage.get<FullPhase[]>(SCAN_SANDBOX_PHASES_KEY)) ?? [];
  }

  // -----
  // The Scan's one meter, holding the whole Budget cap. It is made on
  // the first launch and kept as it is after that.
  // -----
  async #openMeter(budgetUsd: number): Promise<Meter> {
    const existing = await this.ctx.storage.get<Meter>(SCAN_SANDBOX_METER_KEY);
    if (existing !== undefined) return existing;
    const meter = freshMeter(budgetUsd);
    await this.ctx.storage.put<Meter>(SCAN_SANDBOX_METER_KEY, meter);
    return meter;
  }

  // -----
  // The files of the run that is going now: the last Phase that was
  // started, or the one run of a Scan with no Phases.
  // -----
  async #currentFiles(): Promise<AgentFiles> {
    const last = (await this.#startedPhases()).at(-1);
    return last === undefined ? DEFAULT_AGENT_FILES : phaseAgentFiles(last);
  }

  // -----
  // A log from a byte offset on, empty when the file is not there yet.
  // -----
  async #logFrom(path: string, offset: number): Promise<string> {
    try {
      const process = await this.#container.exec(["tail", "-c", `+${offset + 1}`, path], { cwd: SCAN_SANDBOX_WORK_DIR, env: SCAN_SANDBOX_TRUST_ENV });
      const output = await process.output();
      return output.exitCode === 0 ? new TextDecoder().decode(output.stdout) : "";
    } catch {
      return "";
    }
  }

  // -----
  // The last bytes of a log, null when the file is not there. The first
  // line may be cut; the lines a caller wants (the result line) are last.
  // -----
  async #logEnd(path: string): Promise<string | null> {
    try {
      const process = await this.#container.exec(["tail", "-c", `${SCAN_SANDBOX_LOG_READ_BYTES}`, path], { cwd: SCAN_SANDBOX_WORK_DIR, env: SCAN_SANDBOX_TRUST_ENV });
      const output = await process.output();
      return output.exitCode === 0 ? new TextDecoder().decode(output.stdout) : null;
    } catch {
      return null;
    }
  }

  async #readText(path: string): Promise<string | null> {
    try {
      return await (await this.#files.readFile(path)).text();
    } catch {
      return null;
    }
  }

  async #start(repo: string, github?: OutboundGithub, anthropicKey?: OutboundAnthropicKey): Promise<void> {
    if (this.#container.running) return;
    const outbound = this.#context.exports.Outbound({ props: { sandboxId: this.#context.id.toString(), repo, github, anthropicKey } });
    this.#container.start({
      image: this.#container.images.sandbox,
      instance: SCAN_SANDBOX_INSTANCE_TYPE,
      enableInternet: false,
    });
    await this.#container.interceptAllOutboundHttp(outbound);
    await this.#container.interceptOutboundHttps("*", outbound);
    await this.#container.setInactivityTimeout(SCAN_SANDBOX_INACTIVITY_MS);
  }

  async #sh(script: string, args: string[], guardMs: number): Promise<void> {
    const process = await this.#container.exec(["/bin/sh", "-c", script, "sh", ...args], {
      cwd: SCAN_SANDBOX_WORK_DIR,
      env: SCAN_SANDBOX_TRUST_ENV,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`command did not finish within ${guardMs / 1000}s`)), guardMs);
    });
    try {
      const output = await Promise.race([process.output(), guard]);
      if (output.exitCode !== 0) {
        const decoder = new TextDecoder();
        const detail = (decoder.decode(output.stderr) || decoder.decode(output.stdout)).slice(-SCAN_SANDBOX_LOG_TAIL_CHARS);
        throw new Error(`command exited ${output.exitCode}: ${detail}`);
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
