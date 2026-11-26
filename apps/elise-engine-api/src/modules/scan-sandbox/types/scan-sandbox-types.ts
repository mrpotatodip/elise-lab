// -----
// Agent
// -----
export type AgentState = { state: "running" } | { state: "succeeded" } | { state: "failed"; error: string };
export type OutboundExport = (options: { props: OutboundProps }) => Fetcher;
export type OutboundTarget = "anthropic" | "github" | null;

// -----
// What a clone read: the commit, and the branch when there is
// one to name (git's own answer for a plain clone, the ref for
// a branch scan, nothing for a tag, a commit or a detached HEAD).
// -----
export type ScanCheckout = { commitSha: string | null; branch: string | null };

// -----
// What the Outbound proxy counts for one scan
// -----
export type MeteredTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};
// -----
// reservedUsd is what calls still in flight may yet cost; a meter
// stored before it existed has none.
// -----
export type Meter = MeteredTokens & { budgetUsd: number; spentUsd: number; reservedUsd?: number; refused?: boolean };

// -----
// The Phases of a full Scan. They run in order and share the one meter.
// refused says the meter turned a model call away: the Scan spent its
// whole Budget cap. It is the only way to tell a Scan that ran out of
// money from one that failed.
// -----
export type FullPhase = "recon" | "hunt" | "check" | "report";
// -----
// The Anthropic key an account brought, still sealed (encrypted):
// Outbound opens it at the moment of a model call. Absent for an
// account on the platform key.
// -----
export type OutboundAnthropicKey = { accountId: string; sealed: string };
// -----
// repo is the one repo this scan reads, as owner/name in lowercase.
// Outbound passes git requests for no other repo, public or not.
// -----
export type OutboundProps = { sandboxId: string; repo: string; anthropicKey?: OutboundAnthropicKey };
