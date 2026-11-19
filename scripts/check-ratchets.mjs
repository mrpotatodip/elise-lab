#!/usr/bin/env node
// A ratchet is a count that may fall but never rise. scripts/ratchets.json holds the
// baseline; this check fails when a count goes above it. `--update` rewrites the
// baseline to today's counts, which is how a gain gets locked in.
//   comments: wrapped `// -----` blocks per file in the engine and the dashboard
//             (outside constants/, types/ and __tests__/); a block is two rules.
//   rust:     comment lines per .rs file under apps/elise-runner-cli.
//   github:   the literal "GitHub" in non-test files of the dashboard's repo and scan
//             modules, one total.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(root, "scripts/ratchets.json");
const COMMENT_ROOTS = ["apps/elise-engine-api/src", "apps/elise-frontend-web/src"];
const GITHUB_ROOTS = ["apps/elise-frontend-web/src/modules/repo", "apps/elise-frontend-web/src/modules/scan"];
const DIVIDER = /^\s*\/\/ -{5,}\s*$/;
const ADVICE = "Remove the comment (names, types and small functions say what code does). If a rule in docs/standards asks for it, raise the baseline in this same commit (node scripts/check-ratchets.mjs --update) so the reviewer sees it.";

const tracked = (...patterns) => spawnSync("git", ["ls-files", "-z", "--", ...patterns], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 }).stdout.split("\0").filter(Boolean);
const lines = (file) => fs.readFileSync(path.join(root, file), "utf8").split("\n");
const isTest = (file) => /\/__tests__\/|\.test\.tsx?$/.test(file);
const sorted = (entries) => Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export function countRatchets() {
  const comments = [];
  for (const file of tracked(...COMMENT_ROOTS.map((r) => `${r}/*.ts`), ...COMMENT_ROOTS.map((r) => `${r}/*.tsx`))) {
    if (/\/(constants|types|__tests__)\//.test(file)) continue;
    const dividers = lines(file).filter((line) => DIVIDER.test(line)).length;
    if (dividers > 0) comments.push([file, Math.ceil(dividers / 2)]);
  }
  const rust = [];
  for (const file of tracked("apps/elise-runner-cli/*.rs")) {
    const count = lines(file).filter((line) => line.trim().startsWith("//")).length;
    if (count > 0) rust.push([file, count]);
  }
  let github = 0;
  for (const file of tracked(...GITHUB_ROOTS.map((r) => `${r}/*.ts`), ...GITHUB_ROOTS.map((r) => `${r}/*.tsx`))) {
    if (isTest(file)) continue;
    github += lines(file).join("\n").split("GitHub").length - 1;
  }
  return { comments: sorted(comments), rust: sorted(rust), github };
}

export function findRatchetBreaks() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const current = countRatchets();
  const breaks = [];
  for (const kind of ["comments", "rust"]) {
    const unit = kind === "comments" ? "wrapped comment blocks" : "Rust comment lines";
    for (const [file, count] of Object.entries(current[kind])) {
      const old = baseline[kind]?.[file] ?? 0;
      if (count > old) breaks.push(`${file}: ${unit} went from ${old} to ${count}. ${ADVICE}`);
    }
  }
  if (current.github > baseline.github) breaks.push(`apps/elise-frontend-web/src/modules/{repo,scan}: the word "GitHub" went from ${baseline.github} to ${current.github}. Use the provider's name from data, not a literal. If a rule asks for it, raise "github" in scripts/ratchets.json in this same commit.`);
  return breaks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--update")) {
    const current = countRatchets();
    fs.writeFileSync(BASELINE, `${JSON.stringify(current, null, 1)}\n`);
    const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    console.log(`ratchets: ${Object.keys(current.comments).length} files / ${total(current.comments)} blocks, ${Object.keys(current.rust).length} files / ${total(current.rust)} Rust comment lines, ${current.github} GitHub`);
  } else {
    const breaks = findRatchetBreaks();
    if (breaks.length) {
      console.error(breaks.join("\n"));
      process.exit(1);
    }
    console.log("ratchets: within baseline");
  }
}
