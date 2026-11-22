#!/usr/bin/env node
// ADR numbers must be unique and every citation must point at a file that exists:
//   - two files in docs/adr must not share a number;
//   - a cited `docs/adr/NNNN-slug.md` path must exist;
//   - an `ADR NNNN` or `ADR-NNNN` citation must name a number that has a file.
// Scans git-tracked text files, except .skills-store, .agents, node_modules,
// pnpm-lock.yaml, *.html and migration snapshots (generated or vendored text).
// Excluded by path, each for its reason: none yet.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = /(^|\/)(\.skills-store|\.agents|node_modules)\/|(^|\/)pnpm-lock\.yaml$|\.html$|\/migrations\/meta\/|^scripts\/check-adr\.mjs$/;
const EXCLUDED_FILES = new Set([]);
const TEXT = /\.(md|mdx|ts|tsx|mjs|js|json|jsonc|rs|toml|yml|yaml|txt|sql|css|astro)$/;

export function findAdrProblems() {
  const files = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 }).stdout.split("\0").filter(Boolean);
  const adrFiles = files.filter((file) => /^docs\/adr\/\d{4}-.+\.md$/.test(file));
  const byNumber = new Map();
  for (const file of adrFiles) {
    const number = path.basename(file).slice(0, 4);
    byNumber.set(number, [...(byNumber.get(number) ?? []), file]);
  }
  const problems = [];
  for (const [number, same] of byNumber) if (same.length > 1) problems.push(`docs/adr: number ${number} is used by ${same.length} files (${same.map((f) => path.basename(f)).join(", ")}). Renumber the newer one and fix its citations.`);
  const known = new Set(adrFiles);
  for (const file of files) {
    if (SKIP.test(file) || EXCLUDED_FILES.has(file) || !TEXT.test(file) || !fs.existsSync(path.join(root, file))) continue;
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const [, cited] of text.matchAll(/docs\/adr\/(\d{4}-[\w.-]*?\.md)/g)) {
      if (!known.has(`docs/adr/${cited}`)) problems.push(`${file}: cites docs/adr/${cited}, which does not exist.`);
    }
    for (const [, number] of text.matchAll(/\bADR[ -](\d{4})\b/g)) {
      if (!byNumber.has(number)) problems.push(`${file}: cites ADR ${number}, which has no file in docs/adr.`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = findAdrProblems();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("adr: ok");
}
