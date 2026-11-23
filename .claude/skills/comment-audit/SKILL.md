---
name: comment-audit
description: Delete the code comments in one path that the comment rule does not allow, file an issue for each excuse, and move each decision into an ADR. Takes a folder or file.
disable-model-invocation: true
---

# Comment audit

Take one path, sort every comment in it, act on each, and lock the lower count in. The rule is `docs/standards/general.md` section 1: write no comments, except the ones 1.2 lists.

## Input

A folder or file, such as `apps/elise-engine-api/src/modules/archives`. With none, ask for it. Work on one module at a time, so the diff stays reviewable.

## 1. Collect

List every comment in the path: `//` lines, `/* */` blocks, `///` and `//!` in Rust. Skip what 1.2 allows: `// SAFETY:`, dividers in `constants/` and `types/`, the comments another rule asks for, and directives a tool reads. For each remaining comment, read the code around it.

Done when every comment in the path is on the list or named as allowed by a rule in 1.2.

## 2. Sort

Put each comment in exactly one class:

| Class | The comment | Action |
|---|---|---|
| Tautology | says what the code already shows | delete |
| Stale | names code, a ticket or a behaviour that is gone | delete |
| Excuse | admits or covers a hack (`TODO`, `HACK`, `for now`, `workaround`, `should really`) | delete, and file an issue for the hack |
| Decision | gives a reason that the code, the name and the types cannot show | move to an ADR, then delete |

When two classes fit, take the lower row of the table: a stale comment that holds a reason is a Decision; an Excuse whose reason is real is an Excuse plus a Decision.

Done when no comment is unsorted and each Decision names the sentence that goes to the ADR.

## 3. Act

- **Delete** every Tautology, Stale, Excuse and Decision comment from the code. Use the Edit tool, one comment at a time.
- **Excuse:** write one issue per hack, not per comment. Title it with the behaviour to fix. The body names the file and function, and says what a clean version does. The repo is public: no secret, token or customer data. Show the list of issues, then file them with `gh issue create` once the user agrees. Labels: `docs/agents/triage-labels.md`.
- **Decision:** add the reason to the ADR for that area, or write a new ADR in `docs/adr/` using the next number. Follow `mattpocock-domain-modeling` for the form, and use the terms in `GLOSSARY-MAP.md`. One reason per paragraph, in plain words.

A comment that a rule in `docs/standards` asks for stays. If it no longer fits its rule, delete it.

Done when the path holds only comments that 1.2 allows, and each deleted Decision is in an ADR.

## 4. Lock it in

1. `node scripts/check-ratchets.mjs --update`, so the lower counts go into `scripts/ratchets.json`.
2. `pnpm check:apps` for the changed projects.
3. Read the `git diff` once: only comment lines and the ratchet file should change in code files. If code moved, undo it.

## 5. Report

One short message:

- comment lines deleted, by class, and lines of code the diff shed
- the issues filed, as links
- the ADRs changed or added, as links
- the comments left, and which rule allows each
