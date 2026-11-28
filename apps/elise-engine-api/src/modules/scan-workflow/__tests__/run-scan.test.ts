import { Effect } from "effect";
import type { WorkflowStep } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ScanUsage } from "@repo/contracts/elise";
import { fakeBindings } from "#/__tests__/fake-bindings";
import { memoryScanRepo } from "#/__tests__/memory-scan-repo";
import { testSealer } from "#/__tests__/sealed-test-helpers";
import type { ScanParams, ScanState } from "#/schemas";
import { SCAN_SANDBOX_FULL_PHASES, type FullPhase, type OutboundAnthropicKey } from "#/modules/scan-sandbox";
import { runScan } from "#/modules/scan-workflow/lib";
import type { SandboxPort } from "#/modules/scan-workflow/types";

const ACCOUNT = "0b8c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4";
const REPO_ID = "5d1f0c9a-2b3e-4f60-9a71-8b92c3d4e5f6";
const usage: ScanUsage = {
  inputTokens: 1,
  outputTokens: 2,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0.1,
  turns: 3,
  durationMs: 4000,
};

const params = (extra: Partial<ScanParams> = {}): ScanParams => ({
  scanId: "scan-1",
  accountId: ACCOUNT,
  repo: "https://github.com/octocat/Hello-World",
  options: { skill: "lite", model: "claude-haiku-5-5", effort: "low", profile: "quick", maxBudgetUsd: 1 },
  createdAt: new Date().toISOString(),
  ...extra,
});

// -----
// A step that runs each callback inline and writes down the
// names in order, which is all the real one adds that a run
// depends on.
// -----
const fakeStep = (names: string[]): WorkflowStep => {
  const run = async <T>(name: string, ...rest: [() => Promise<T>] | [object, () => Promise<T>]): Promise<T> => {
    names.push(name);
    return (rest.length === 1 ? rest[0] : rest[1])();
  };
  // SAFETY: only do and sleep are used by runScan; the fake keeps their calling shape.
  return { do: run, sleep: async (name: string) => void names.push(name) } as never;
};

type SetupOptions = {
  recordFails?: ScanState;
  agent?: "succeeded" | "failed" | "running";
  pollThrows?: boolean;
  sealedKey?: string;
  maxPolls?: number;
  phases?: readonly FullPhase[];
  failingPhase?: FullPhase;
  capReachedInPhase?: FullPhase;
};

const setup = (options: SetupOptions = {}) => {
  let currentPhase: FullPhase | undefined;
  let capReached = false;
  const names: string[] = [];
  const calls: string[] = [];
  const settles: string[] = [];
  const signalRuns: string[] = [];
  const ledger = memoryScanRepo();
  const bindings = fakeBindings();
  const prepares: { ref?: string }[] = [];
  const anthropicKeys: (OutboundAnthropicKey | undefined)[] = [];
  const sandbox: SandboxPort = {
    prepare: async (_url, ref, anthropicKey) => {
      prepares.push({ ref });
      anthropicKeys.push(anthropicKey);
      return { commitSha: "abc123", branch: ref && /^v\d/.test(ref) ? null : (ref ?? "main") };
    },
    launchAgent: async () => undefined,
    putHandoverFiles: async () => undefined,
    launchPhase: async (_options, phase) => {
      currentPhase = phase;
      capReached = capReached || options.capReachedInPhase === phase;
      calls.push(`launch:${phase}`);
    },
    capReached: async () => capReached,
    pollAgent: async () => {
      if (options.failingPhase !== undefined && options.failingPhase === currentPhase)
        return { state: "failed", error: "claude exited 1" };
      if (options.pollThrows) throw new Error("sandbox unreachable");
      if (options.agent === "running") return { state: "running" };
      return options.agent === "failed" ? { state: "failed", error: "claude exited 1" } : { state: "succeeded" };
    },
    agentLogTail: async () => "log",
    readUsage: async () => usage,
    readFiles: async () => ({ "REPORT.md": "# report", "findings.json": "[]" }),
    readCheckout: async () => null,
    destroy: async () => void calls.push("destroy"),
  };
  const deps = {
    maxPolls: options.maxPolls ?? 240,
    phases: options.phases,
    sandbox,
    ledger: ledger.repo,
    reports: bindings.env.REPORTS,
    sealerFor: testSealer,
    sealedKeyFor: async () => options.sealedKey ?? null,
    handoverFiles: async () => [],
    recordScan: async (_params: ScanParams, status: ScanState) => {
      calls.push(`record:${status}:${ledger.rows.get("scan-1")?.status}`);
      if (options.recordFails === status) throw new Error("database down");
    },
    saveTrace: async () => ({ accepted: 0, dropped: 0 }),
    settleCredit: async (_params: ScanParams, status: "succeeded" | "failed") => void settles.push(status),
    detectSignals: async (_params: ScanParams) => void signalRuns.push(ledger.rows.get("scan-1")?.status ?? "none"),
  };
  return { names, calls, ledger, bindings, prepares, anthropicKeys, settles, signalRuns, deps };
};

const failingSaveTrace = async () => Promise.reject(new Error("database down"));

const queue = async (ledger: ReturnType<typeof memoryScanRepo>, input: ScanParams) => {
  await Effect.runPromise(ledger.repo.create(input, REPO_ID, 0));
};

describe("runScan, a full scan in phases", () => {
  const full = (extra: Partial<ScanParams> = {}) =>
    params({ options: { ...params().options, skill: "full" }, ...extra });

  it("runs recon, hunt, check and report in order, each started and waited for, and no single-run launch", async () => {
    const { names, calls, ledger, deps } = setup({ phases: SCAN_SANDBOX_FULL_PHASES });
    await queue(ledger, full());

    await runScan(deps, full(), fakeStep(names));

    expect(calls.filter((call) => call.startsWith("launch:"))).toEqual([
      "launch:recon",
      "launch:hunt",
      "launch:check",
      "launch:report",
    ]);
    expect(names).not.toContain("launch-agent");
    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "succeeded" });
  });

  it("goes on to the next phase when one reached the cap but still ended well, as a Partial Scan does", async () => {
    const { names, calls, ledger, deps } = setup({ phases: SCAN_SANDBOX_FULL_PHASES, capReachedInPhase: "hunt" });
    await queue(ledger, full());

    await runScan(deps, full(), fakeStep(names));

    expect(calls).toContain("launch:report");
    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "succeeded" });
  });

  it("fails the scan with an error that says the cap was reached when a phase ends with an error after the whole pool was spent, and charges what the meter counted", async () => {
    const { names, calls, ledger, settles, deps } = setup({
      phases: SCAN_SANDBOX_FULL_PHASES,
      failingPhase: "hunt",
      capReachedInPhase: "hunt",
    });
    await queue(ledger, full());

    await expect(runScan(deps, full(), fakeStep(names))).rejects.toThrow(
      "the budget cap of $1 was reached during the hunt phase",
    );

    expect(calls).not.toContain("launch:check");
    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "failed", usage });
    expect(settles).toEqual(["failed"]);
  });

  it("fails the scan when a phase fails with money left, and starts no later phase", async () => {
    const { names, calls, ledger, deps } = setup({ phases: SCAN_SANDBOX_FULL_PHASES, failingPhase: "hunt" });
    await queue(ledger, full());

    await expect(runScan(deps, full(), fakeStep(names))).rejects.toThrow("claude exited 1");

    expect(calls).not.toContain("launch:check");
    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "failed" });
  });

  it("fails a phase that outruns its own time slot, and says which", async () => {
    const { names, ledger, deps } = setup({ phases: SCAN_SANDBOX_FULL_PHASES, agent: "running" });
    await queue(ledger, full());

    await expect(runScan(deps, full(), fakeStep(names))).rejects.toThrow("the recon phase timed out after 10 minutes");
    expect(names.filter((name) => name.startsWith("poll-recon-"))).toHaveLength(60);
  });

  it("never fails the scan when its trace cannot be read or written", async () => {
    const { names, ledger, deps } = setup({ phases: SCAN_SANDBOX_FULL_PHASES });
    await queue(ledger, full());
    const entry = {
      id: "0190f1a2-b3c4-7d5e-8f60-000000000001",
      label: "searching",
      phase: "recon",
      startedAt: "2026-11-19T09:00:00.000Z",
      endedAt: "2026-11-19T09:00:00.000Z",
      count: 1,
    } as const;
    const sandbox: SandboxPort = {
      ...deps.sandbox,
      drainTrace: async (ended) => {
        if (ended) throw new Error("container gone");
        return [entry];
      },
    };

    await runScan({ ...deps, sandbox, saveTrace: failingSaveTrace }, full(), fakeStep(names));

    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "succeeded" });
  });

  it("sends the entries a phase's log gave, and an end marker once the phase is over", async () => {
    const { names, ledger, deps } = setup({ phases: SCAN_SANDBOX_FULL_PHASES });
    await queue(ledger, full());
    const calls: boolean[] = [];
    const saved: number[] = [];
    const sandbox: SandboxPort = {
      ...deps.sandbox,
      drainTrace: async (ended) => {
        calls.push(ended);
        return [
          {
            id: "0190f1a2-b3c4-7d5e-8f60-000000000001",
            label: "searching",
            phase: "recon",
            startedAt: "2026-11-19T09:00:00.000Z",
            endedAt: "2026-11-19T09:00:00.000Z",
            count: 1,
          },
        ];
      },
    };

    await runScan(
      {
        ...deps,
        sandbox,
        saveTrace: async (_params, body) => (
          saved.push(body.entries.length),
          { accepted: body.entries.length, dropped: 0 }
        ),
      },
      full(),
      fakeStep(names),
    );

    expect(calls.filter(Boolean)).toHaveLength(4);
    expect(saved.length).toBeGreaterThanOrEqual(4);
  });

  it("runs a lite scan as one run, whatever phases a Workflow has", async () => {
    const { names, calls, ledger, deps } = setup();
    await queue(ledger, params());

    await runScan(deps, params(), fakeStep(names));

    expect(names).toContain("launch-agent");
    expect(calls.filter((call) => call.startsWith("launch:"))).toEqual([]);
  });
});

describe("runScan", () => {
  it("stops waiting for the agent after its own number of polls, and says how long that was", async () => {
    const { names, ledger, deps } = setup({ agent: "running", maxPolls: 6 });
    await queue(ledger, params());

    await expect(runScan(deps, params(), fakeStep(names))).rejects.toThrow("the agent timed out after 1 minutes");
    expect(names.filter((name) => name.startsWith("poll-"))).toHaveLength(6);
    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "failed" });
  });

  it("saves the results first: the scan is still running when it is recorded, and succeeded after", async () => {
    const { names, calls, ledger, deps } = setup();
    await queue(ledger, params());

    await runScan(deps, params(), fakeStep(names));

    expect(calls).toEqual(["record:succeeded:running", "destroy"]);
    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "succeeded", error: null, usage, commitSha: "abc123" });
    expect(names.indexOf("record-scan-succeeded")).toBeLessThan(names.indexOf("status-succeeded"));
  });

  it("hands the sandbox the account's sealed Anthropic key, and nothing for an account on the platform key", async () => {
    const own = setup({ sealedKey: "iv.ciphertext" });
    await queue(own.ledger, params({ keySource: "account" }));
    await runScan(own.deps, params({ keySource: "account" }), fakeStep(own.names));
    const platform = setup();
    await queue(platform.ledger, params());
    await runScan(platform.deps, params(), fakeStep(platform.names));

    expect(own.anthropicKeys).toEqual([{ accountId: ACCOUNT, sealed: "iv.ciphertext" }]);
    expect(platform.anthropicKeys).toEqual([undefined]);
  });

  it("never opens a stored key for a scan the plan put on the platform key", async () => {
    const stored = setup({ sealedKey: "iv.ciphertext" });
    await queue(stored.ledger, params({ keySource: "platform" }));

    await runScan(stored.deps, params({ keySource: "platform" }), fakeStep(stored.names));

    expect(stored.anthropicKeys).toEqual([undefined]);
  });

  it("settles the scan's credit once it has succeeded", async () => {
    const { names, ledger, deps, settles } = setup();
    await queue(ledger, params());

    await runScan(deps, params(), fakeStep(names));

    expect(settles).toEqual(["succeeded"]);
  });

  it("settles the scan's credit when it fails, and still reports the failure", async () => {
    const { names, ledger, deps, settles } = setup({ agent: "failed" });
    await queue(ledger, params());

    await expect(runScan(deps, params(), fakeStep(names))).rejects.toThrow("claude exited 1");
    expect(settles).toEqual(["failed"]);
  });

  it("lets a scan succeed when its credit cannot be settled", async () => {
    const { names, ledger, deps } = setup();
    await queue(ledger, params());
    const broken = { ...deps, settleCredit: async () => Promise.reject(new Error("database down")) };

    await expect(runScan(broken, params(), fakeStep(names))).resolves.toEqual({ ok: true });
  });

  it("looks for possible duplicates once the scan is succeeded, and only then", async () => {
    const ok = setup();
    await queue(ok.ledger, params());
    await runScan(ok.deps, params(), fakeStep(ok.names));
    const bad = setup({ agent: "failed" });
    await queue(bad.ledger, params());
    await expect(runScan(bad.deps, params(), fakeStep(bad.names))).rejects.toThrow("claude exited 1");

    expect(ok.signalRuns).toEqual(["succeeded"]);
    expect(bad.signalRuns).toEqual([]);
  });

  it("leaves the scan succeeded when the duplicate signals step fails", async () => {
    const { names, ledger, deps } = setup();
    await queue(ledger, params());
    const broken = { ...deps, detectSignals: async () => Promise.reject(new Error("TypeSafe answered 500")) };

    await expect(runScan(broken, params(), fakeStep(names))).resolves.toEqual({ ok: true });

    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "succeeded" });
  });

  it("saves the branch the clone reported, with the commit", async () => {
    const { names, ledger, deps } = setup();
    await queue(ledger, params());

    await runScan(deps, params(), fakeStep(names));

    expect(ledger.rows.get("scan-1")).toMatchObject({ commitSha: "abc123", branch: "main" });
  });

  it("hands the ref as it was typed to the clone, and saves the branch the clone reports: a branch, or none for a tag", async () => {
    const onBranch = setup();
    await queue(onBranch.ledger, params({ ref: "release" }));
    await runScan(onBranch.deps, params({ ref: "release" }), fakeStep(onBranch.names));
    const onTag = setup();
    await queue(onTag.ledger, params({ ref: "v1.0.0" }));
    await runScan(onTag.deps, params({ ref: "v1.0.0" }), fakeStep(onTag.names));

    expect(onBranch.prepares).toEqual([{ ref: "release" }]);
    expect(onBranch.ledger.rows.get("scan-1")).toMatchObject({ branch: "release" });
    expect(onTag.prepares).toEqual([{ ref: "v1.0.0" }]);
    expect(onTag.ledger.rows.get("scan-1")).toMatchObject({ branch: null });
  });

  it("fails the scan when its results cannot be recorded, and still tries to record the failure", async () => {
    const { names, calls, ledger, deps } = setup({ recordFails: "succeeded" });
    await queue(ledger, params());

    await expect(runScan(deps, params(), fakeStep(names))).rejects.toThrow("could not be recorded: database down");

    expect(ledger.rows.get("scan-1")).toMatchObject({
      status: "failed",
      error: expect.stringContaining("the results were saved but could not be recorded"),
    });
    expect(calls).toEqual(["record:succeeded:running", "record:failed:failed", "destroy"]);
  });

  it("fails the scan with the agent's error, and survives a failure to record the failure", async () => {
    const { names, ledger, deps } = setup({ agent: "failed", recordFails: "failed" });
    await queue(ledger, params());

    await expect(runScan(deps, params(), fakeStep(names))).rejects.toThrow("claude exited 1");

    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "failed", error: "claude exited 1" });
    expect(names).not.toContain("record-scan-succeeded");
  });

  it("keeps the spend of a scan whose polling threw after the agent started", async () => {
    const { names, ledger, deps } = setup({ pollThrows: true });
    await queue(ledger, params());

    await expect(runScan(deps, params(), fakeStep(names))).rejects.toThrow("sandbox unreachable");

    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "failed", error: "sandbox unreachable", usage });
  });

  it("does not let a scan that a newer request closed come back to life", async () => {
    const { names, ledger, deps } = setup();
    await queue(ledger, params());
    await Effect.runPromise(
      ledger.repo.mark(ACCOUNT, "scan-1", { status: "failed", error: "closed by a newer request" }),
    );

    await runScan(deps, params(), fakeStep(names));

    expect(ledger.rows.get("scan-1")).toMatchObject({ status: "failed", error: "closed by a newer request" });
  });
});
