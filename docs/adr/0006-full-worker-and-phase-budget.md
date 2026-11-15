# Full worker, profiles and one budget pool

How `apps/elise-engine-api` runs a Scan with the `full` Skill, how a Scan's Budget cap is set from its Profile and spent, and who may run one. Terms: `apps/elise-engine-api/GLOSSARY.md` (Full worker, Profile, Phase, Partial Scan, Budget cap, Verdict weight, Outbound handler). A Step is still cloning, auditing or saving; a Phase is a part of the audit and is never called a Step.

## Two workers inside one Worker

- **The lite path and the full path are separate.** A full Scan has its own Workflow, its own Sandbox class and its own Image. A lite Scan keeps the existing ones. The reason: a full Scan runs for an hour or more and holds a Sandbox the whole time. On shared classes it would take the place of lite Scans and a slow full Scan would stop a person's quick check from starting.
- **Every new Scan in our cloud takes the full path.** The request's `skill` field is ignored (`create-scan-svc.ts`). A Scan already running finishes on the class it started on. Old lite rows are only read.
- **It stays one Worker.** Two Workers would mean two deploys, two sets of secrets and two copies of the `Outbound` code that holds the Anthropic key. Separate classes give the isolation we need without that.
- **Limits are separate too.** A full Scan has a time limit for each Phase (10, 45, 25 and 10 minutes, 90 in all) and counts as live for 130 minutes without a status change. Each path has its own count of live Scans for each Account (`MAX_ACTIVE_FULL_SCANS`, 1) and a count over all Accounts (`MAX_GLOBAL_FULL_SCANS`, 3). A new Scan over a limit is refused with a busy message and no queue. We do not queue because a queue hides a wait that the person cannot see and cannot cancel.

## The Budget cap comes from the Profile

- **Three profiles.** `quick`, `standard` and `deep` (the dashboard says Focused, Balanced and Exhaustive). No profile means `quick`. The dashboard form starts on `standard`.
- **The caps are a table, and they are guesses.** `SCAN_PROFILE_CAPS_USD` (`src/constants/scan-constants.ts`) gives $6, $12 and $18. They stay provisional until the first real Scans (#142) are measured.
- **A request may lower the cap, never raise it.** `MAX_BUDGET_FULL_USD` ($18 today) is the ceiling that guards the table: a profile whose cap is above it refuses its Scans, so a wrong table never starts one. Lite requests keep `MAX_BUDGET_USD` ($2) and `MAX_BUDGET_OWN_KEY_USD` ($10) until the lite path is removed, so no live lite Scan gets a bigger cap. A Runner Scan keeps `RUNNER_MAX_BUDGET_USD` as its own ceiling.
- **Credit.** A new Scan on the platform's key holds the cap it was given times the Plan's markup (1.5). The Account is charged only what the meter counted, times the markup. `GET /usage/credit` returns each profile's cap and hold.

## The Budget cap is one pool

- **One meter for the Scan.** The four Phases (`recon`, `hunt`, `check` and `report`) run in order as separate runs of the Agent and spend from one meter that holds the whole cap (`scan-sandbox/utils/meter.ts`). No Phase has a share of its own, and nothing moves between Phases.
- **No Report reserve.** When the pool is spent the meter refuses each new model call. A Partial Scan with a Report happens only when the Skill reads the budget message while it can still write its files: it then marks unfinished units `deferred` with `money_exhausted`, and the Report starts with `PARTIAL:`. A Phase that ends cleanly goes on to the next one.
- **A Scan that spends its whole pool** ends with the error `the budget cap of $N was reached during the P phase`, and writes no Report. It is charged its metered cost times the markup, as any failed Scan with a recorded cost is. This risk is accepted: #142 counts how many real Scans end this way, and a Report reserve is added if it is common.
- **Runner Scans have no server meter.** The Agent stops at the cap through its own budget limit, and the Skill gets no budget message, so a capped Runner Scan mostly ends with the error above. #142 counts how often.

## A Partial Scan keeps its Report

A Scan that runs out of money while the Skill can still write its files ends with a Report and a findings file. Both say it is partial and name the units that were not covered. It is charged only what was metered. The reason: a Scan that ends in an error with no Report loses the money already spent and tells the person nothing. A Partial Scan's Report with its gaps named is something a person can act on, and they can start another Scan for what was missed. Whether the Scan was partial is saved on its row when it is recorded (`scans.partial`), so the Verdict reads that column, not the Report. A Partial Scan weighs 0 in a Verdict and its findings still count as open (ADR 0003).

## Who may run a Scan

- **A Scan on the platform's key needs a Plan.** An Account with no Plan and no key of its own is refused with `NO_ACTIVE_PLAN`. `BILLING_ENFORCED` keeps its own, wider rule (it also covers own-key and Runner Scans) and is `false` today. An Account with no Plan that has its own key runs on that key, as before. Own-key Scans and Runner Scans are not refused for lack of a Plan. This ships before profile Scans open on the platform's key (#135 before #134), so no Scan runs on the platform's key without a credit hold.
- **The Monthly budget still applies once an admin sets one on a Plan.** A Scan whose hold would pass it is refused, and the message names the biggest smaller profile that would fit, or says the budget is too low for any profile.
- **Tenant isolation is checked before profile Scans reach the platform's key.** Row-level security on the remaining tenant tables and the two-Account isolation test (#60) must pass before #134 is deployed. Full Scans keep more of a customer's code in one place for longer, so a leak between Accounts costs more.

## Reversal: measurement no longer comes first

- **This reverses the measure-first rule.** An earlier version of this ADR held full Scans on the platform's key until the measurement (#69) had set the full ceiling and the minimum cap. That rule is reversed. Why: the Plan rule and the cap give a bounded loss. A platform-key Scan needs a Plan and holds its cap times the markup, so a wrong guess costs at most the cap per Scan. The first real Scans (#142) take the place of the measurement, and the caps stay guesses until then.
- **The isolation test stays a gate.** #60 must pass before #134 is deployed, and the owner checks it by hand.

## Runner Scans

- **A Runner Scan runs one Agent, not Phases.** The Runner app runs the full Skill and stops at the cap the job carries (`profileCapUsd`, #145). The engine stores a Runner Scan as `full` only when `RUNNER_FULL_SCANS` is `"true"`. It stays `"false"` until a Runner app release that runs the full Skill is out. Deploy order: the engine's job fields, then the app release, then the variable.
- **A Runner Scan takes no credit** and counts only against `MAX_ACTIVE_SCANS` for its Account, never against the full or global caps.

## Not built here

- The numbers: the profile caps, `MAX_BUDGET_FULL_USD` and the Verdict weights are guesses until #142 measures real Scans.
- Per-Account caps (a later layer above the defaults), a Report reserve, and the removal of the lite path (#141).
- Phase costs and a Partial badge in the dashboard (#67).
