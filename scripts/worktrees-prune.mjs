#!/usr/bin/env node
// Lists the worktrees under .claude/worktrees: folder, branch, clean or dirty file
// count, whether GitHub has a merged PR for the branch, and whether the remote branch
// still exists. A squash merge hides containment from `git merge-base --is-ancestor`,
// so the merge state comes from GitHub. Dry run by default; `--remove` removes only an
// entry that is clean and has a merged PR (no --force), then deletes its branch.
// The main checkout is never listed or touched.
import path from "node:path";
import { spawnSync } from "node:child_process";

const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8" });
const common = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]).stdout.trim();
const main = path.dirname(common);
const remove = process.argv.includes("--remove");

const entries = run("git", ["worktree", "list", "--porcelain"], main).stdout.split("\n\n").map((block) => {
  const field = (key) => block.split("\n").find((l) => l.startsWith(`${key} `))?.slice(key.length + 1);
  return { dir: field("worktree"), branch: field("branch")?.replace("refs/heads/", "") };
}).filter((e) => e.dir && e.dir !== main && e.dir.startsWith(`${main}/.claude/worktrees/`));

if (entries.length === 0) console.log("no worktrees under .claude/worktrees");
for (const { dir, branch } of entries) {
  const dirty = run("git", ["status", "--porcelain"], dir).stdout.split("\n").filter(Boolean).length;
  let merged = false;
  let remote = false;
  if (branch) {
    const prs = run("gh", ["pr", "list", "--head", branch, "--state", "merged", "--json", "number"], main);
    merged = prs.status === 0 && JSON.parse(prs.stdout || "[]").length > 0;
    remote = run("git", ["ls-remote", "--exit-code", "--heads", "origin", branch], main).status === 0;
  }
  const removable = dirty === 0 && merged && Boolean(branch);
  console.log(`${path.basename(dir)}  branch=${branch ?? "(detached)"}  ${dirty === 0 ? "clean" : `${dirty} dirty files`}  merged PR=${merged ? "yes" : "no"}  remote branch=${remote ? "yes" : "no"}${removable ? "  -> removable" : ""}`);
  if (!remove || !removable) continue;
  const gone = run("git", ["worktree", "remove", dir], main);
  if (gone.status !== 0) {
    console.error(`  not removed: ${gone.stderr.trim()}`);
    continue;
  }
  run("git", ["branch", "-D", branch], main);
  console.log("  removed");
}
