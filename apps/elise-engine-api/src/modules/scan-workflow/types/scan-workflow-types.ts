import type { HandoverFile, SaveTraceBody, ScanUsage, TraceEntry, TraceSaved } from "@repo/contracts/elise";
import type { ScanFiles } from "#/lib/scan-file-types";
import type { ScanOptions, ScanParams, ScanState } from "#/schemas";
import type { ScanRepo } from "#/modules/scan-ledger";
import type { Sealer } from "#/modules/sealed-data";
import type { AgentState, FullPhase, OutboundAnthropicKey, ScanCheckout } from "#/modules/scan-sandbox";

// -----
// The sandbox as the Workflow uses it. Its Durable Object
// stub fits, and a test can stand in a fake.
// -----
export type SandboxPort = {
  prepare: (repoUrl: string, ref?: string, anthropicKey?: OutboundAnthropicKey) => Promise<ScanCheckout>;
  launchAgent: (options: ScanOptions) => Promise<void>;
  // -----
  // Writes the hand-over files (HandoverFile) into the output
  // directory, before the first Phase, and notes their names so the
  // Phase prompts can mention them. Cloud only: a Runner's job
  // carries the files itself. Not optional, for the reason given at
  // readCheckout.
  // -----
  putHandoverFiles: (files: HandoverFile[]) => Promise<void>;
  // -----
  // The two calls of a full Scan's Phases. A Phase is one run of the agent;
  // the Phases share the Scan's one Budget cap. pollAgent answers for the
  // run that is going, and capReached says the meter turned a model call
  // away: the whole cap is spent. Neither is optional, for the reason
  // given at readCheckout.
  // -----
  launchPhase: (options: ScanOptions, phase: FullPhase) => Promise<void>;
  capReached: () => Promise<boolean>;
  pollAgent: () => Promise<AgentState>;
  agentLogTail: () => Promise<string>;
  readUsage: () => Promise<ScanUsage | null>;
  // -----
  // The Trace entries that are new or grew in the running Phase's log
  // since the last call, and a Phase's end marker when `ended`. Only
  // the cloud Sandbox has it: a Runner sends its own entries.
  // -----
  drainTrace?: (ended: boolean) => Promise<TraceEntry[]>;
  readFiles: () => Promise<ScanFiles>;
  // -----
  // Only a sandbox that learns the commit after the agent ends has
  // an answer (a Runner clones on its own computer); the cloud
  // Sandbox returns null, because `prepare` already gave it. It is
  // not optional: a Durable Object stub accepts any method name,
  // so a missing one fails at run time, after the agent was paid.
  // -----
  readCheckout: () => Promise<ScanCheckout | null>;
  destroy: () => Promise<void>;
};

// -----
// Everything a run touches outside itself: the sandbox, the
// ledger, the bucket, and the read and the writes that reach
// the database.
// -----
export type ScanRunDeps = {
  sandbox: SandboxPort;
  maxPolls: number;
  phases?: readonly FullPhase[];
  ledger: ScanRepo;
  reports: R2Bucket;
  sealerFor: (accountId: string) => Promise<Sealer>;
  sealedKeyFor: (accountId: string) => Promise<string | null>;
  handoverFiles: (params: ScanParams) => Promise<HandoverFile[]>;
  recordScan: (params: ScanParams, status: ScanState, error: string | null, usage: ScanUsage | null) => Promise<void>;
  saveTrace: (params: ScanParams, body: SaveTraceBody) => Promise<TraceSaved>;
  detectSignals: (params: ScanParams) => Promise<void>;
  settleCredit: (params: ScanParams, status: "succeeded" | "failed", usage: ScanUsage | null) => Promise<void>;
};

export type PollResult = { state: "running" | "succeeded" | "failed"; error?: string };
