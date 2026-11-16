# Full worker, profiles and one budget pool

How `apps/elise-engine-api` runs a Scan with the `full` Skill, how a Scan's Budget cap is set from its Profile and spent, and who may run one. Terms: `apps/elise-engine-api/GLOSSARY.md` (Full worker, Profile, Phase, Runner, Partial Scan, Budget cap, Pool, Verdict weight, Outbound handler). A Step is still cloning, auditing or saving; a Phase is a part of the audit and is never called a Step.

## Two workers inside one Worker

- **There is one path: the full one.** A full Scan has its own Workflow (`FullScanWorkflow`), its own Sandbox class (`FullScanSandbox`) and its own Image (`Dockerfile.full`). The lite Skill, Workflow, Sandbox class and Image were removed (#141). The reason they were separate while both existed: a full Scan runs for an hour or more and holds a Sandbox the whole time, so on shared classes it would have taken the place of lite Scans.
- **Every new Scan takes the full path, a Scan on a Runner included.** The request's `skill` field is ignored (`create-scan-svc.ts`; #146 removes it). Old lite rows are only read.
- **It stays one Worker.** Two Workers would mean two deploys, two sets of secrets and two copies of the `Outbound` code that holds the Anthropic key. Separate classes give the isolation we need without that.
- **Limits are separate too.** A full Scan has a time limit for each Phase (10, 45, 25 and 10 minutes, 90 in all) and counts as live for 130 minutes without a status change. Each path has its own count of live Scans for each Account (`MAX_ACTIVE_FULL_SCANS`, 1) and a count over all Accounts (`MAX_GLOBAL_FULL_SCANS`, 3). A new Scan over a limit is refused with a busy message and no queue. We do not queue because a queue hides a wait that the person cannot see and cannot cancel.

## The Budget cap comes from the Profile

- **Three profiles.** `quick`, `standard` and `deep` (the dashboard says Focused, Balanced and Exhaustive). No profile means `quick`. The dashboard form starts on `standard`.
- **The caps are a table, and they are guesses.** `SCAN_PROFILE_CAPS_USD` (`src/constants/scan-constants.ts`) gives $6, $12 and $18. They stay provisional until the first real Scans (#142) are measured.
- **A request may lower the cap, never raise it.** `MAX_BUDGET_FULL_USD` ($18 today) is the ceiling that guards the table: a profile whose cap is above it refuses its Scans, so a wrong table never starts one. `MAX_BUDGET_USD`, `MAX_BUDGET_OWN_KEY_USD` and `MAX_GLOBAL_LITE_SCANS` went with the lite path. A Runner Scan keeps `RUNNER_MAX_BUDGET_USD` as its own ceiling.
- **Credit.** A new Scan on the platform's key holds the cap it was given times the Plan's markup (1.5). The Account is charged only what the meter counted, times the markup. `GET /usage/credit` returns each profile's cap and hold.

## The Budget cap is one pool

- **One meter for the Scan.** The four Phases (`recon`, `hunt`, `check` and `report`) run in order as separate runs of the Agent and spend from one meter that holds the whole cap (`scan-sandbox/utils/meter.ts`). No Phase has a share of its own, and nothing moves between Phases.
- **No Report reserve.** When the pool is spent the meter refuses each new model call. A Partial Scan with a Report happens only when the Skill reads the budget message while it can still write its files: it then marks unfinished units `deferred` with `money_exhausted`, and the Report starts with `PARTIAL:`. A Phase that ends cleanly goes on to the next one.
- **A Scan that spends its whole pool** ends with the error `the budget cap of $N was reached during the P phase`, and writes no Report. It is charged its metered cost times the markup, as any failed Scan with a recorded cost is. This risk is accepted: #142 counts how many real Scans end this way, and a Report reserve is added if it is common.
- **Runner Scans have no server meter.** The Agent stops at the cap through its own budget limit, and the Skill gets no budget message, so a capped Runner Scan ends with the error above and never as a Partial Scan. How the Runner holds the pool is under Runner Scans. #142 counts how often.

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

- **A Runner Scan runs the four Phases (#156, #158).** This reverses an earlier decision here, that a Runner Scan runs one Agent, not Phases, and that a Runner cannot meter a Phase. One run of the Agent with one prompt left it to the prompt how much work went to sub-agents, and a real Exhaustive Scan ended as one agent. The Runner app now runs `recon`, `hunt`, `check` and `report` as four runs of `claude`, in order, each on the Phase prompt the engine put in the job (`phasePrompts`, #157, built for the Runner's place). The app keeps its permission model: its deny rules, its tool allowlist and accept-edits mode, and never the flag that switches permissions off, because a person's computer has no container and the repository is untrusted. The engine stores every Runner Scan as `full`; there is no flag any more.
- **One pool, held by the app.** The cap is the lower of the job's `profileCapUsd` and the Runner's ceiling (`budget_for`). The app starts each Phase with `--max-budget-usd` set to the money still left: the cap less the `total_cost_usd` that the earlier Phases reported in their own final JSON results. Nothing moves between Phases, and there is no Report reserve. The agent is told nothing about money, so the Skill cannot mark units `money_exhausted`, and no code of the app invents a `deferred` unit or a `PARTIAL:` line.
- **What ends a Runner Scan whose pool is spent.** A Phase that finds nothing left does not start, and a Phase that the limit stops (its result says `error_max_budget_usd`) ends the Scan. Both end it as failed, with the cap-reached error naming that Phase, whatever files the Phase had written, and the engine stores no files of it. A Runner Scan is never made a Partial Scan by the app. A Phase that fails any other way, or outruns its slot, ends the Scan with an error that names the Phase and what the agent said. A failed Scan keeps its work folder on the person's computer, with the files of the finished Phases in it; a Scan that succeeds removes it.
- **The cost the engine sees.** The result carries one `agentLog`, and the engine reads the last JSON object in it. After the last Phase the app adds one line: the last Phase's own result with `total_cost_usd`, `num_turns`, `duration_ms` and the four `usage` token counts summed over every Phase that ran (a failed Scan sends it too). The engine does not change.
- **Time.** The Phases have 90 minutes in all, each with the cloud's slot (10, 45, 25 and 10 minutes). The clone and the validators are outside them. The validators run in the app once, after the `check` Phase, on `findings.json` and `coverage-ledger.json`; a failure names the `check` Phase and ends the Scan. The 40-minute limit stays only for a job that carries no Phase prompts. The engine's wait is longer for a Runner Scan than the cloud's (#157).
- **An older pairing of app and engine still works.** A job always carries the single prompt as well. An app that does not know Phases ignores `phasePrompts`, and a new app that gets none runs once on the single prompt, as before, under the 40-minute limit and the old rule (a run the limit stopped after it wrote its report is a Partial Scan).
- **The deploy order is a rule for the profile fields.** The engine's job fields (#144), then the Runner app release that runs the full Skill, then the engine that removes the lite path (#141). An old app that claims a full job runs it under the Runner's own ceiling, not the profile cap. The app release must be cut from a commit before #141 removed the lite Skill folder from its bundle, or be built knowing that a lite job can no longer run. For Phases the order does not matter: the job is additive.
- **A Runner Scan takes no credit** and counts only against `MAX_ACTIVE_SCANS` for its Account, never against the full or global caps.

## Not built here

- The numbers: the profile caps, `MAX_BUDGET_FULL_USD` and the Verdict weights are guesses until #142 measures real Scans.
- Per-Account caps (a later layer above the defaults), a Report reserve, and the removal of the `skill` request field (#146).
- Phase costs and a Partial badge in the dashboard (#67).
