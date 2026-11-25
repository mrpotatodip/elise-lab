# A Runner Scan can be resumed as a new Scan

How a Runner Scan that failed or was stopped carries on without paying for its finished work again. Terms: `apps/elise-engine-api/GLOSSARY.md` (Resumed Scan, Phase, Pool, Stopped Scan). It changes one line of `docs/adr/0006-full-worker-and-phase-budget.md`: a failed Runner Scan's kept work folder is no longer only for reading.

## The rule

**A Resumed Scan is a new Scan that points at the Scan it resumes. The old Scan stays as it ended.** It may follow a failed Scan, a Scan the Runner stopped, or a Stopped Scan. It may not follow a Scan whose Pool was spent. It runs on the same Runner, on the same commit, with the same profile, Branch, ref and Budget cap. It starts from the kept work folder, spends from the Pool left after what the folder's own log shows was spent, and takes no credit. It counts as a live Scan for the limits.

**Where it restarts.** The Runner writes a checkpoint after every Phase that ends cleanly. A resume reads it and refuses to start if its Scan ID or commit does not match, or if it is missing. `recon` and `report` restart from the top. `hunt` and `check` resume by unit: when the kept coverage ledger passes `validate-coverage-ledger.cjs`, the Runner adds one paragraph to the Phase prompt (keep final units, put `in_progress` units back to `planned`, work only the rest). A ledger that is missing or invalid restarts the Phase from the top. The paragraph is in the Runner's prompt only, never in the Skill.

## Why

- **A new Scan, not a reopened one.** A Stopped Scan is final and a History is frozen (ADR 0002). Reopening a row would change findings, a Trace and a Verdict weight that were already settled. A link keeps the old record true and puts the chain of attempts in one place.
- **Same Runner only.** The folder is on one computer and is not uploaded. Uploading each Phase's files was the bigger build and was left out on purpose.
- **Units, not Phases, inside `hunt` and `check`.** `hunt` runs many agents for a long time. A crash there would lose all of it if only whole Phases were skipped. The ledger is the one file that already says what is finished.
- **The Runner trusts only what it can check.** The parent agent is a model that writes the ledger, so the validator decides whether the ledger is used, and the money spent comes from the folder's own log, never from a number the engine sends.
- **The prompt, not the Skill.** Every Skill line costs tokens on every Scan, and a resume is rare. The Runner already builds a repair prompt the same way.

## Consequences

- A resume cannot move to another computer, and cannot start if the Runner was removed.
- The kept folder stays until the resumed Scan succeeds, then goes with it. There is no timer.
- A prompt cannot force the agent to skip finished units. The profile check stays the proof.
