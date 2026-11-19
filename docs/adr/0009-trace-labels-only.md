# The Trace stores labels only, never model content

How a running Scan shows what the agent is doing (#238). Terms: `apps/elise-engine-api/GLOSSARY.md` (Trace, Trace entry). The Scan paths it reads: `docs/adr/0006-full-worker-and-phase-budget.md`.

## The rule

**A Trace entry holds a label from a closed set, a Phase, a start time, an end time and a count. Nothing the agent wrote.** No text, no reasoning, no path, no search pattern, no command and no tool result is stored, and a tool result is dropped unread. The set is `TRACE_LABEL_VALUES` in `@repo/contracts/elise`: reasoning, reading files, searching, running a command, writing, calling a tool (any tool we do not know), phase started and phase ended.

## Why

- The agent reads a customer's source. Anything it says or reads can hold code or a secret. A table of labels is as safe to show and keep as a status line, so it needs no redaction rule that someone can forget.
- A person waiting on a Scan needs to know that the agent is working and what kind of work it is doing, not what it said. Labels answer that.
- A new `claude` version cannot leak anything new into the table: a line or a tool the classifier does not know becomes "Calling a tool" or is ignored.

## What it keeps

- **Both producers classify the same way.** The Runner (Rust) and the cloud Worker (TypeScript) each read the agent's streaming output line by line and must agree on the shared fixture in `packages/contracts/fixtures/trace-classifier/`.
- **Capture never fails or slows a Scan.** A failed write or a parse error is dropped and logged.
- **Entries belong to an Account through their Scan.** They sit under the same row-level security as the other tenant tables and go when their Scan goes.
- **A sanity cap** of 5,000 entries per Scan stops a runaway producer from filling the table. A retried batch is an upsert on the producer's UUIDv7, so it creates no duplicates.
- **Silence only informs.** The dashboard shows a notice after 3 minutes with no entries. It never stops or fails a Scan.

## What would change it

Showing any model content in the Trace (a file name, a pattern, a title) is a new decision with its own review of what leaves the customer's repository, and does not follow from this one.
