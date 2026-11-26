---
name: spec-audit
description: Review a spec (a GitHub parent issue and its sub-issue tickets) against the code, glossary, ADRs and standards, and report the findings. Read-only: it never edits the spec, the tickets or the code.
disable-model-invocation: true
---

# Spec audit

Take a spec, check it against what the repo already says, and report what is wrong with it, worst first. Run it after `to-spec` and `to-tickets`, before anyone implements.

## Read-only

This skill finds and reports. It does not edit the spec or a ticket, comment on an issue, label, create a branch or change code. If the user wants a fix or a comment posted, they ask for it as a separate request. The repo is public: the report stays in the chat, and a finding quotes behaviour, never a secret or customer data.

## Input

An issue number or URL for the spec. With none, ask for it. If the argument is a ticket, go up to its parent spec.

## 1. Gather

- `gh issue view <n> --comments` for the spec, including its discussion.
- Its sub-issues: `gh api repos/mrpotatodip/elise-lab/issues/<n>/sub_issues --jq '.[] | {number, title, state}'`, then `gh issue view` each one.
- The context the spec touches: `GLOSSARY-MAP.md` and the `GLOSSARY.md` it points to, `docs/adr/`, `CODING_STANDARDS.md` and the file under `docs/standards/` for each scope the spec touches (`contracts.md` for any shared shape).
- The code the spec says it will change, read to check what is there now. Do not run builds, tests or scans.

Done when you can name each module, route, table and contract the spec touches and have read it.

## 2. Checks

| Check | Passes when |
|---|---|
| S1 Problem | the problem is stated from the user's side and is one problem, not a solution in disguise |
| S2 Solution fits | the solution solves S1, and nothing in it is unrelated to S1 |
| S3 Stories | each user story names an actor and a benefit, none contradicts another, and together they cover the behaviour in the solution |
| S4 Facts | every claim about the current code, data or deployment is true now (read the code; confirm a deployed claim with `pnpm engine:probe <path>` only if a token is in the environment, otherwise list it as unverified) |
| S5 Vocabulary | the terms match the glossary, and a new term is defined once |
| S6 ADRs | nothing in the spec contradicts an ADR, and a decision that reverses one says so |
| S7 Standards | the decisions respect `CODING_STANDARDS.md` and the scope files (contract changes follow the deploy order in `docs/standards/contracts.md` section 5) |
| S8 Decisions | each implementation decision is concrete enough to build from, has no open "TBD" or "maybe", and holds no file path or code that will age |
| S9 Testing | tests are at the fewest, highest seams, test behaviour not internals, and follow the test rule in `docs/standards/general.md` section 2 |
| S10 Out of scope | it names what is left out, and nothing in the stories or tickets sits inside it |
| S11 Risk | data migrations, live-database writes, deploys and anything that costs real money are named, with their order and who must approve |
| S12 Public repo | the text holds no exploit detail, secret or customer data |
| T1 Coverage | every story and decision is covered by at least one ticket, and no ticket is outside the spec |
| T2 Slices | each ticket is a vertical slice that can be verified alone and fits one fresh context |
| T3 Edges | each ticket has a "Blocked by" section, the edges are real, there is no cycle, and the sub-issue links match the spec's task list |
| T4 Labels | each ticket is `ready-for-agent` or `ready-for-human`, and the spec carries the `spec` label only |

A **finding** cites its evidence: a quote from the spec or ticket, plus the file, glossary entry, ADR or standard it conflicts with (`path:line`, or `ADR 0003`, `general.md section 2`). A finding with no evidence is not reported. A rule the repo does not state is "not covered by the repo docs", not a finding from memory of the web.

Severity, used only to put the worst first:

| Severity | Meaning |
|---|---|
| blocker | the spec is wrong or contradicts the code, an ADR or itself; building it as written would fail or do harm |
| major | a gap or ambiguity that makes two builders build different things |
| minor | wording, order or polish |

Every check ends with findings or "clean". Do not skip a check, and do not give scores or ratings.

## 3. Report

Open with one count line, for example `Spec #124: 1 blocker, 3 major, 4 minor`. These are counts, not a score.

Then each finding on one line, worst first: the check number, where in the spec or ticket (`#124 Solution`, `#119 Blocked by`), what is wrong, the evidence, and the one change that would fix it. Group the clean checks in one line at the end.

Then two short lists:

- **Unverified**: claims the review could not check (a deployed field with no token, a price, a vendor limit), each with its quote.
- **Not reviewed**: tickets or linked pages that were closed, missing or unreadable.

End with a verdict line: `Ready to build`, `Ready after the blockers are fixed` or `Needs rework`, and nothing after it. Change nothing in the repo or the issues.
