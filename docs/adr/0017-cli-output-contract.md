# The Elise CLI's output and exit codes are a contract that changes only by addition

How people, scripts and AI agents rely on the `elise` command (#475). Terms: `apps/elise-engine-api/GLOSSARY.md` (Elise CLI, Runner, Scan). The Runner rules it sits on: `docs/adr/0006-full-worker-and-phase-budget.md`. What a `run` event may hold: `docs/adr/0009-trace-labels-only.md` and `docs/adr/0013-live-findings-early.md`.

## The rule

**What the Elise CLI prints with `--json`, the events `run --json` prints, and its exit codes change only by addition.** A field, an event, a command or an exit code may be added. None is removed, renamed, retyped or given a new meaning. Anything else needs a new `schemaVersion`, and a new version is a new decision with its own record.

- **Exit codes:** 0 success, 1 error, 2 bad usage, 3 unpaired, 4 revoked, 5 offline, 6 nothing to claim (`run --once`), 7 a Scan was stopped from Elise, 8 `scan --wait` ran out of `--timeout` (the Scan keeps running), 9 a Scan ended as a Partial Scan. A refusal to prompt reuses 2.
- **`--json`:** one object on standard output with `schemaVersion`, `ok`, `exitCode` and the command's fields. A failure is `{ ok: false, error: { code, message, next } }`. Prose and progress go to standard error. The `exitCode` field and the process exit code agree.
- **`run --json`:** one object per line, in six events: `claimed`, `phase_started`, `phase_finished`, `finding`, `result`, `stopped`. They hold labels, counts and IDs only. `finding` events arrive per Phase, just before its `phase_finished`, not live. When `run` ends without running a Scan (unpaired, revoked, offline, nothing to claim, no signal handler) it prints one failure object, as any other command does, with the same exit code.
- **No input:** with no terminal on stdin, or with `--no-input`, the program never prompts. `pair` then needs `--yes` and exits 2 without it.
- **No token in output:** no command prints a token except `pair --print-token`.
- **One table:** `src/table.rs` declares every command, flag, exit code and topic once. `--help`, `help <topic>`, `commands --json`, the completions, the agent skill and the README command reference are generated from it, so they cannot disagree. The README region is checked by a test and fails when stale.

## Why

- A script or an agent cannot ask what a line meant. It parses it. A pipeline that breaks on an update costs more than a field we keep and never use.
- It is hard to reverse. Once a script reads `exitCode` 4 as "revoked", changing it breaks that script silently, on a machine we cannot see.
- It is surprising without context. A reader would take a clumsy field name or an unused exit code for a mistake and tidy it. This record says the clumsiness is on purpose.
- Events with labels, counts and IDs only keep the stream safe for a log shipper: an agent reads a customer's source, so what it wrote must not reach a log (ADR 0009).

## What it costs

The CLI cannot fix a poor name or a wrong code once it ships. A mistake is kept and a better field is added beside it. The help carries a few more rows over time. We accept this because callers cannot be updated in step with the program.

## What would change it

A removed or changed field, event or exit code is a breaking change: it needs a new `schemaVersion`, a new ADR, and a release note that says what breaks. Showing model content in an event is a separate decision (ADR 0009).
