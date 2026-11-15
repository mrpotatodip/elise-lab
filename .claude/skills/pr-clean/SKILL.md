---
name: pr-clean
description: "Merge the PR that /pr opened, then clean up: delete the remote branch, remove the worktree, delete the local branch, discard the leftover edit in the main checkout."
disable-model-invocation: true
---

Run from the main checkout, never from inside the worktree. The PR is the one for the branch the user names, or the branch of the newest worktree under `.claude/worktrees/`.

## 1. Merge

A PR already `MERGED` skips to step 2: `gh pr view <n> --json state -q .state`.

`main` requires the `check` job and a branch that is up to date with `main` (strict), squash merges only, auto-merge off. Every merge therefore leaves each other open PR behind `main` and its check stale. Read the state first: `gh pr view <n> --json mergeStateStatus,baseRefName -q '"\(.mergeStateStatus) \(.baseRefName)"'`, then branch on it:

- `CLEAN`: `gh pr merge <n> --squash --delete-branch`. Its failure to delete the local branch is expected while a worktree holds it.
- `BEHIND`: `gh pr update-branch <n>`. Stop there if it prints a conflict, and treat the PR as `DIRTY`. Otherwise `sleep 20` (a fresh push has no run yet, and `--watch` attaches to the previous one), `gh pr checks <n> --watch`, then merge as for `CLEAN`.
- `DIRTY`, usually a stacked PR whose base was squash-merged: it still carries the base's old commits. Ask the user first, since this force-pushes. In the PR's worktree: `git fetch`, `git rebase --onto origin/main <old base tip>` (`git log --oneline origin/main..HEAD` shows the commits to keep), resolve conflicts, `pnpm check:apps`, `git push --force-with-lease`, then `sleep 20`, `gh pr checks <n> --watch` and merge.
- `UNKNOWN`: GitHub is still calculating, as right after a base merged and the PR was retargeted to `main`. Wait a few seconds and read it again.

A conflict in `update-branch` or in the rebase is a file to resolve, and the choice of side is the user's: show the file and ask first. Never `--admin`.

Merge a stack bottom-up, one PR at a time: each PR is retargeted to `main` when its base merges, then takes the `DIRTY` row.

Done when `gh pr view <n> --json state -q .state` prints `MERGED`. If a check fails, or the PR is still `OPEN` after the watch, report which check and stop: steps 2 to 4 wait for the merge, and a later `/pr-clean` run resumes here.

## 2. Remove the worktree

A dev server started inside the worktree keeps recreating `node_modules/.vite` there after the removal. Find it first: `lsof -nP -iTCP -sTCP:LISTEN` and `lsof -p <pid> | grep cwd`. A process whose `cwd` is inside the worktree is the user's, so ask before `kill <pid>`.

`git worktree remove .claude/worktrees/<name>`. Git refuses a worktree with uncommitted edits; report them and stop. The audit evidence under `.review/` goes with the worktree: copy it out first when the user may want it. A PR with no worktree skips this step; `gh pr merge --delete-branch` then removed the local branch too, so step 3's `git branch -D` has nothing to do.

Done when `git worktree list` no longer shows it and `ls .claude/worktrees/<name>` finds nothing. A folder of only cache files is a leftover: look at it, then `rm -r` it.

## 3. Delete the local branch

Step 4 comes first when the main checkout holds an edit to a file the PR touched: the pull refuses to overwrite it.

Another session may work in the main checkout. Run `git branch --show-current` and `git status --short` there first, and branch on the answer:

- It prints `main` and the status is clean, or lists only files the PR touched: `git pull --ff-only`.
- It prints another branch: leave that branch checked out. Run `git fetch` only, and report that the local `main` is behind `origin/main`.

Then `git branch -D <branch>`. A squash merge leaves the branch commits outside `main`, so `-d` always refuses; the `MERGED` state from step 1 is the safety check.

Done when `git branch --list <branch>` prints nothing, and the main checkout is unchanged in branch and edits, except for the pull in the first case.

## 4. Discard the leftover edit

The main checkout may hold the PR's change as an uncommitted edit (a dev server regenerates `routeTree.gen.ts` there). Run `git diff HEAD --stat` and `git status --short` first.

- The edit equals the merged file, and the main checkout is on `main`: `git fetch`, then `git diff origin/main -- <file>` prints nothing. Run `git checkout origin/main -- <file>`, then `git merge --ff-only origin/main`. A running dev server rewrites a restored `routeTree.gen.ts` at once, so a plain restore then pull can fail.
- The edit differs from `main`: list the files and ask the user before `git restore --staged --worktree <file>`.

Done when `git status --short` lists no file the PR touched.

## Report

One line per step: done, skipped, or stopped and why.
