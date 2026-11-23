---
name: implement-spec-lean
description: "Cheaper way to run /implement-spec: merge clean ticket branches yourself, merger agents only for hard conflicts, cheaper model for mechanical tickets. Invoke before or during an /implement-spec run."
disable-model-invocation: true
---

These rules change how `/implement-spec` runs. They replace its steps 5 and 6 where they differ. Everything else in `/implement-spec` stands.

## Merging

- Do the clean merges of ticket branches into the integration branch yourself. Do not start a merger subagent for them.
- Make one worktree on the integration branch and keep it for the whole run: `git worktree add .claude/worktrees/<feature> <integration-branch>`. It is also the worktree the user reviews at the end.
- Merge with `git merge --no-ff <ticket-branch>`, with the ticket number and title in the message and the commit trailer from the system reminder.
- Run `pnpm install --frozen-lockfile --offline` once, then `pnpm check:apps` once per batch of merges, not once per merge. If `chat-bot-api` `drizzle-store.test.ts` times out, re-run that project alone (`pnpm --filter @repo/chat-bot-api check`) before you call it a failure.
- Start a merger subagent only for a conflict you cannot settle quickly (a migration number clash, a large clash in a shared file). Give it the conflict, not the whole merge.
- A branch can sit in only one worktree. Two agents cannot both hold the integration branch, so never run two mergers at once.

## Implementers

- Tell each one to run `node scripts/check-changed.mjs` on its own changes, not `pnpm check:apps --all`.
- Start a ticket the moment its blockers are merged. Do not wait for unrelated tickets.
- End every brief with: "Finish with one final report, then stop. Leave no background wait timers or watchers running." Without it agents re-send the same report.
- Set a smaller model on mechanical tickets (docs and ADR text, removing a field, adding optional fields). Keep the default model for large ones.

## Limits that stay

- Never merge the integration branch into `main`. Never push, deploy, run a live migration or start a real Scan without the user's yes.
- Ask before closing the tickets on the issue tracker.
