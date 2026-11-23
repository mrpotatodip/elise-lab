# Issue tracker

Issues live on GitHub: `origin` is `mrpotatodip/elise-lab` (renamed from `ts-mrpotato-lab` on 2026-11-24; the old name redirects). That repo is **public**, so a spec or ticket holds behaviour and decisions only: no exploit detail, no secrets, no customer data.

## Specs and tickets

- A spec is a **parent issue** titled `<Feature>: spec`: problem, solution, behaviour, out of scope, a task list of its tickets, and what moves to the glossary or an ADR when it ships. Label it `spec` (purple), and nothing else, so a spec is told from a ticket at a glance.
- Each ticket is a **sub-issue** of the spec, with its blockers in a "Blocked by" section. Label it `ready-for-agent`, or `ready-for-human` when a person must run it.
- Draft and discuss in the spec's thread. When the feature ships, move what is still true into the glossary, then close the spec.
- Link sub-issues with `gh api -X POST repos/<owner>/<repo>/issues/<spec>/sub_issues -F sub_issue_id=<id>`, where `<id>` is the child's `gh api repos/<owner>/<repo>/issues/<n> --jq .id`, not its number.
- Do not add a `PRD.md` under `.scratch/`; older ones there stay as they are.

## Commands

Use the `gh` CLI:

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: `gh issue list --state open`
- **Comment**: `gh issue comment <number> --body "..."`
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

**PRs as a request surface: no.** Only issues go through triage; PRs are treated as ordinary code changes.

## When a skill says "publish to the issue tracker"

File it with `gh` as described above. Only if `gh` is unavailable, write it under `apps/<project>/.scratch/<feature>/` and note that it still needs filing.

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments`, and the spec it hangs off.
