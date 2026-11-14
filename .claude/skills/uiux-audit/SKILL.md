---
name: uiux-audit
description: Audit a screen's UI/UX and report the findings from three views: design, a junior developer, and a non-technical user. Read-only and unscored: it never edits code and gives no ratings.
disable-model-invocation: true
---

# UI/UX audit

Three views of one screen: **Design** (UI/UX best practice), **Junior** (a developer new to security work, reading a result to act on it), **Layperson** (someone who does not write code, deciding whether the product is safe to ship). The output is a list of findings, worst first. There are no scores, no ratings and no target number.

## Read-only

This skill finds and reports. It never edits code, creates a branch, commits, pushes or deploys. It does not offer to fix. If the user wants a fix, they ask for it as a separate request.

## Offline rule

Every standard this skill uses is written out in the reference files below. Do not use WebFetch or WebSearch, and do not open an outside page, a standard, a design system or a competitor's site, for any step, including the reviewer subagent. Open only the routes the user named (localhost or their own deployed app). If a rule is not in a reference file, say "not covered by the references" and do not report it from memory of the web.

## Reference files

Read the file for a check before judging it, and put the matching block ("Core discipline") in the reviewer prompt.

| File | Used for |
|---|---|
| [WCAG-22-AA.md](WCAG-22-AA.md) | D11, and any finding on contrast, targets, focus, keyboard, labels, language, motion or reflow |
| [NIELSEN-HEURISTICS.md](NIELSEN-HEURISTICS.md) | D12, the severity scale, and judgement calls |
| [PLAIN-LANGUAGE-AND-ERRORS.md](PLAIN-LANGUAGE-AND-ERRORS.md) | L1, L3, L6, J3, J6, every error and empty state |
| [PUBLIC-PAGES.md](PUBLIC-PAGES.md) | a public page only (landing, marketing, pricing): first view, claims, speed, previews, phones |
| [EVIDENCE.md](EVIDENCE.md) | step 1: the fixed list of calls that collects the evidence, and what to read from it |
| [evidence.js](evidence.js) | the one script that returns the page facts, text, contrast, targets and heading gaps as JSON |
| [REVIEWER-PROMPT.md](REVIEWER-PROMPT.md) | step 3: the prompt for the cold reviewer, filled in and not retyped |
| [SOURCES.md](SOURCES.md) | where each reference file came from, as names only; not a list to fetch |

`DESIGN.md` and `DESIGN-SCREENS.md` of the app under review still decide the Design checks D1 to D10.

## 1. Evidence

Take the route(s) from the user, and the widths they name (default: desktop and the narrowest phone width). Run the recipe in [EVIDENCE.md](EVIDENCE.md) on each route and width, saving every result under `.review/uiux-audit/` and reading from the saved files. It is a fixed list of about eight calls, with one script (`evidence.js`) for all the numbers, so it is cheap and the same each time. Do not run `chrome-review` as well: the recipe covers its passes, and it points to the app's `DESIGN.md` for the rules.

Record `git diff --stat` and `git status --short` in `.review/uiux-audit/start-diff.txt` before any run step, because the tree may already hold other work.

Done when every route has the files EVIDENCE.md lists and the start-diff file. Every finding below cites one of these.

## 2. Checks and findings

A **finding** cites evidence: a screenshot path, a measured number, or quoted on-screen text. A finding that names a rule also cites it by the number it has in a reference file (`WCAG 2.5.8`, `Nielsen 9`). A finding with no evidence is not reported. A finding that depends on what is deployed (a field or count the screen should show) is confirmed with `pnpm engine:probe <path>` first; with no token in the environment, list it as unverified and not as a defect of the screen.

Every finding has a severity, used only to put the worst first:

| Severity | Meaning | Nielsen scale |
|---|---|---|
| blocker | the reader cannot finish the task, or is misled | 4 |
| major | the reader stalls or makes a mistake | 3 |
| minor | polish | 1 or 2 |

**Design** has twelve checks: D1 to D10 are the ten items of "Design standard" in `DESIGN.md` (each judged with the screen's entry in `DESIGN-SCREENS.md`), D11 is WCAG 2.2 AA and D12 is Nielsen's ten heuristics. Every rule in each is mandatory. Where they disagree, `DESIGN.md` decides.

**Junior** and **Layperson** are a **cold read**, a cognitive walkthrough of what is on screen: the reader sees the snapshot text and screenshot, never the code. A finding on these quotes the on-screen text that fails the check.

| Junior check | Passes when |
|---|---|
| J1 Orientation | the first view says what the screen is and what to do next |
| J2 Terms | each domain or security term is explained on screen, or one hover or click away |
| J3 Cause and fix | each finding, error and failed state says what happened, why, and how to fix it, with an example or link |
| J4 Consequence | each action says what it will do, what it costs and whether it can be undone, before it runs |
| J5 Traceability | each number and status points to its source: the scan, commit or file |
| J6 Labels and help | each column, field and control says what it holds and how to use it, in the same words as on every other screen; a hint sits next to anything a first-time reader could misread (a unit, a time zone, a filter) |

| Layperson check | Passes when |
|---|---|
| L1 Plain words | the main text has no identifiers, file names, enum values or jargon |
| L2 Meaning | each colour, badge and number says what it means for the business, in a sentence |
| L3 Next step | each screen, empty state and error names the one thing to do next, and it needs no developer |
| L4 Safety | each costly, irreversible or outward-facing action says so and asks to confirm |
| L5 Reassurance | when nothing is wrong, the screen says so in words and is not blank |
| L6 Words match | one plain name per thing across screens (the same column is not "Scan" on one page and "Status" on another), and the answer to "what is this?" is on the screen, not only behind a hover |

`DESIGN.md` "Form copy" rules count toward L1 and L3. Check L1, L3 and every error message against `PLAIN-LANGUAGE-AND-ERRORS.md`.

## 3. Review

Running this skill is the user's request for one reviewer subagent. Spawn it with the prompt in [REVIEWER-PROMPT.md](REVIEWER-PROMPT.md), handing it the evidence folder, the checks above and the references. It reads the evidence, checks three facts in it against the live page to catch stale files, takes at most 10 more calls, and writes `.review/uiux-audit/<route>-findings.md`. If no subagent can run, do the review yourself and mark the file and the report "self-checked".

Done when every check (D1 to D12, J1 to J6, L1 to L6) has either findings or "clean" in the file, and `git diff --stat` matches `start-diff.txt` (the repo was not touched).

## 4. Report

Show the findings, worst first (blocker, major, minor), each on one line: route, what is wrong, evidence, the rule's number. Open with a count line per view, for example `Design: 0 blocker, 2 major, 5 minor`. These are counts, not scores. Then "Unverified claims" (promises the page makes that the review cannot check, each with a quote) and "Not tested" (widths, flows and states that were not run). The files stay in `.review/uiux-audit/`. Change nothing in the repo. End with the line "Heuristic review, not user-tested: real users are the next check."
