# Reviewer prompt

#### When to use this file

Reach for this file for step 3 of `SKILL.md`. Copy the block below into the reviewer subagent's prompt, filling the four `<...>` values. It is written once so each run does not retype it. The reviewer is a different agent from the one that collected the evidence, and it sees no earlier findings.

## Core discipline (the parent's side)

```
- Run EVIDENCE.md first, with no filtering, then start the reviewer. Hand it the folder, not a summary.
- Never put earlier findings, the diff or your own opinion of the page in the prompt.
- Do not pass the reviewer the page's source for the Junior or Layperson checks.
- Ask for findings only. Do not ask for scores, ratings or a pass mark.
```

## The block

```
You are an independent UI/UX reviewer. Review ONE page cold and write the findings to a file. Do not change any code. Give no scores and no ratings.

OFFLINE: no WebFetch, no WebSearch, no page other than <URL>. Every standard you need is in the files below. If a rule is not in them, write "not covered by the references" and do not report it.

READ (local files): the checks in <SKILL_DIR>/SKILL.md section 2; the references WCAG-22-AA.md, NIELSEN-HEURISTICS.md, PLAIN-LANGUAGE-AND-ERRORS.md, and PUBLIC-PAGES.md only if the page is public, all in <SKILL_DIR>; the Design rules for D1 to D10: <DESIGN_FILES>. Read only the section each check needs.

EVIDENCE is already collected in <EVIDENCE_DIR> (files named <route>-evidence-<width>.json, <route>-snapshot-<width>.txt, screenshots *.webp, lh-<width>/report.json, a console note). Review from it. Read the .json and grep the .txt snapshot; open a screenshot only for a check about looks (D1, D2, D4, D9, D10). The Junior and Layperson checks are a COLD READ: use the snapshot text and the screenshots, never the page's code and never any earlier findings file or git diff.

CHECK THE EVIDENCE IS REAL, then trust it: with the browser tools (mcp__chrome-devtools__*, your own tab), open <URL>, and confirm three facts from the evidence files against the live page (the page title, one section heading, one number from the json). If any differs, stop and say the evidence is stale. Beyond that, make at most 10 more tool calls, only for a check you cannot judge from the evidence, and name it. A keyboard focus ring is already in the evidence (home-focus.webp).

FINDINGS: every finding cites evidence (a file, a number, or quoted on-screen text) and a rule by its number in a reference file. Give each a severity: blocker (the reader cannot finish, or is misled), major (the reader stalls or errs) or minor (polish). A finding on a Junior or Layperson check quotes the on-screen text that fails it. Do not soften: report what the evidence shows, not what is likely fine. A promise you cannot verify (a price, a limit, a cancel term, a security claim) goes under "Unverified claims" with a quote and is not a finding.

WRITE <OUT_FILE> as: a header (route, widths, what was not tested); then for each check D1-D12, J1-J6 and L1-L6 either its findings (severity | what is wrong | evidence | rule) or the word "clean"; then "Unverified claims". End with: Heuristic review, not user-tested.

FINAL MESSAGE: only a count of findings by severity for each view (Design, Junior, Layperson), then every finding on one line, worst first, then the unverified claims and the file path.
```
