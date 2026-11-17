# Can this commit ship?

How `GET /repos/:repoId/verdict?commit=<sha>` decides in `apps/elise-engine-api`. Terms: `apps/elise-engine-api/GLOSSARY.md` (Verdict, Verdict weight, Partial Scan, Accepted risk, Prior finding). Rules in code: `modules/verdict/utils/judge-commit.ts`.

## What a Verdict claims

- **A gate, not a rate.** A percentage of resolved findings hides one critical problem among many fixed low ones. The answer is `pass`, `fail` or `cannot_tell`, with the counts beside it as evidence.
- **Policy, not safety.** A `pass` means the Scans of this commit found nothing over the limit. A Scan cannot prove that no vulnerability exists.
- **One commit.** "Ship" means one version of the code. A Verdict is stale when the branch moves past its commit.
- **Computed on each request, never stored.** It cannot disagree with the Scans and decisions it reads. A stored snapshot is added only when someone must prove later what the Verdict was on ship day.

## When it passes

- **A weight of at least 1 from the succeeded Scans of the commit** (`VERDICT_MIN_SCANS`). Each Scan adds its weight (`VERDICT_SCAN_WEIGHTS`, in `packages/contracts/src/elise/constants.ts`): `quick` 1, `standard` 1, `deep` 1 and an old `lite` Scan 1. So one Scan of any profile gives a Verdict, and only a Partial Scan or an old full Scan (weight 0) leaves `cannot_tell` for want of weight. The minimum became weight 1 on 2026-11-12. `quick` was 0.5 until 2026-11-16, when the owner set it to 1: a Focused Scan is a partial pass by design (it defers units to a final critic), and it now answers the Verdict like any other, so a person who wants a deeper look runs Balanced or Exhaustive. One look can miss a problem and the agent differs from run to run, but the person reads the Verdict and decides, so one look is enough to answer, and a person who wants a second look starts it. A Scan of a ref counts, because the Verdict is about the commit, not the branch. No Scan is `cannot_tell`. EliseLAB spends no tokens unasked.
- **A Scan's weight is read from its Skill first, then from the profile it met (#161).** A `lite` Scan (old rows only: no new Scan has this Skill) weighs 1 whatever its profile. A full Scan weighs its profile's weight only when its `partial` column is set, which every profile Scan recorded by the current code has. An older full Scan, whose findings were never recorded, weighs 0. A Partial Scan weighs 0 (checked before `profile_met`), so it cannot make a commit pass by itself, but its findings still count as open. A full Scan with a `profile_met` (a Runner Scan the engine checked against its profile) weighs `VERDICT_SCAN_WEIGHTS[profile_met]`: the profile it MET, so a lesser Scan weighs what the smaller profile weighs, and `none` weighs 0. A Scan with no `profile_met` (a cloud Scan, an old row) weighs the profile it asked for, as before. With every profile at 1 today, the only thing `profile_met` changes is that `none` weighs 0; if the weights ever differ, a lesser Scan weighs less than a met one with no further change here (#163 measures whether they should). The newest Scans with a weight, taken until their weights reach the minimum, are the window that the unchecked-priors rules read.
- **An unmet Scan is read, though it weighs 0.** It ends succeeded and its findings count as open, like a Partial Scan's. The Verdict reads a Scan when it has a weight, is partial, or has `profile_met` `none`, so a lone unmet Scan is listed in `scans.ids` and gives `cannot_tell` with the reason `too_few_scans`, not `not_scanned` ("no Scan counts"). It cannot make a commit `pass` by itself.
- **Findings are merged, never averaged.** A problem that any Scan of the commit found is open, at the worst severity any Scan gave it. A second Scan can only make the Verdict stricter. A single `not_found` in the History does not cancel a Finding that another Scan of the same commit saw.
- **Every Prior finding was checked, in the window.** In each Scan of the window, `priors_unchecked` is 0 and `priors_given` is below 50. At 50 the agent was asked about only the worst 50, so the Verdict cannot tell. Older Scans are not read: a Scan that ran out of budget must not block a commit that a good Scan has since cleared. No Scan is given Prior findings any more (#178), so a new Scan's counts are empty and the rule reads them as zero. The rule stays for old `lite` rows, whose `priors_*` columns are kept and still read.
- **Within the limit.** 0 critical, 0 high, at most 3 medium. A problem still `needs_validation` blocks until a person decides it. Low and informational never block. One fixed default for every account; per-account limits wait until someone needs them.
- **Every profile Scan counts (checked 2026-11-15).** The Verdict reads the succeeded Scans of the commit whatever their Skill or profile (`verdict-queries.ts` has no filter on the Skill), with their findings and decisions. It does not read the History, which is frozen. A Partial Scan adds no weight, but its findings count as open, so it can never make a commit `pass` on its own.

`cannot_tell` wins over `fail`: the over-limit reason is still listed, but the Scans are not trusted yet.

## Decisions by a person

- **Accepted risk** needs a signed-in login whose Role holds `company:findings:accepted_risk:update` (`tenant_admin` and `workspace_admin`; the service token is refused), a reason and 1 to 90 days. The triage row and its Audit trail row are saved in one transaction. A database check forbids `accepted_until` on any other status, and forbids an accepted risk with no reason. `PUT /findings/triage` with any other status cannot set it.
- **Expiry blocks again.** The Verdict lists an expired acceptance as open, with the time it ended.
- **Every decision is audited.** `PUT /findings/triage` with any status saves the decision and an Audit trail row in one transaction (`finding.triage.set`, or `finding.risk.accepted`). The row holds the new decision and the one it replaced. The actor is the signed-in person, or no one when the service token set it.
- **A false positive is dismissed, shown and audited.** It is listed under `dismissed`, so a Verdict is never silent about what a person removed. Today any caller with scan access can mark one, so a `pass` can be reached that way; the list and the Audit trail make it visible. Restricting it to admins is open.
- **A manual `fixed` is ignored.** A Scan of this commit found the problem here, and the Verdict is about this commit.

## Not built

- A CI step or GitHub check. EliseLAB has no GitHub App, so a CI step needs its own design once someone names the pipeline.
- Queuing a second Scan by itself. Raise the minimum (`VERDICT_MIN_SCANS`) only if real Scans show a second one still finds new problems.
