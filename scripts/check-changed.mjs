#!/usr/bin/env node
// Quiet check runner. Runs each project's `check` script for every app or
// package with staged changes (`--all`: every one). Silent output on success
// except one line; on failure, the tail of each failing project, lines cut.
import fs from "node:fs";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { findContractCopies } from "./check-contract-copies.mjs";
import { findRatchetBreaks } from "./check-ratchets.mjs";
import { findAdrProblems } from "./check-adr.mjs";

const git = (args) => spawnSync("git", args, { encoding: "utf8" }).stdout.trim();
const baseFlag = process.argv.indexOf("--base");
const base = baseFlag === -1 ? undefined : process.argv[baseFlag + 1];
const baseDiff = (extra = []) => {
  if (!base || base.startsWith("--")) return undefined;
  const diff = spawnSync("git", ["diff", "--name-only", ...extra, `${base}...HEAD`], { encoding: "utf8" });
  return diff.status === 0 ? diff.stdout.split("\n").filter(Boolean) : undefined;
};
const baseFiles = baseFlag === -1 ? undefined : baseDiff();
const all = process.argv.includes("--all") || (baseFlag !== -1 && baseFiles === undefined);
const TAIL_LINES = 25;
const LINE_WIDTH = 180;

const folders = (root) =>
  fs.existsSync(root)
    ? fs
        .readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `${root}/${e.name}`)
    : [];
const allProjects = [...folders("apps"), ...folders("packages")];
const projectOf = (file) => file.match(/^((?:apps|packages)\/[^/]+)\//)?.[1];
const DOCS_ONLY = /^docs\/|\.md$/;

const withDependents = (changed) => {
  const names = new Map();
  const dependencies = new Map();
  for (const dir of allProjects) {
    const file = `${dir}/package.json`;
    if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    names.set(manifest.name, dir);
    dependencies.set(
      dir,
      ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((field) =>
        Object.entries(manifest[field] ?? {})
          .filter(([, range]) => String(range).startsWith("workspace:"))
          .map(([name]) => name),
      ),
    );
  }
  const selected = new Set(changed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [dir, deps] of dependencies) {
      if (selected.has(dir)) continue;
      if (deps.some((name) => selected.has(names.get(name)))) {
        selected.add(dir);
        grew = true;
      }
    }
  }
  return allProjects.filter((dir) => selected.has(dir));
};

const selectFromBase = (files) =>
  files.some((f) => !projectOf(f) && !DOCS_ONLY.test(f))
    ? allProjects
    : withDependents(new Set(files.map(projectOf).filter(Boolean)));

const projects = all
  ? allProjects
  : baseFiles
    ? selectFromBase(baseFiles)
    : [...new Set(git(["diff", "--cached", "--name-only"]).split("\n").map(projectOf).filter(Boolean))];

// A deploy writes the `vars` of wrangler.jsonc over the live Worker's variables, so a
// variable that points only at this machine (a lone localhost URL) breaks production.
// A list that merely includes localhost among real origins is a policy question, not
// this check's: the scan's finding on AUTH_TRUSTED_ORIGINS tracks it.
// Comments and trailing commas are valid in wrangler.jsonc; the first replace keeps
// strings (their `//` is part of a URL).
const jsonc = (text) =>
  JSON.parse(
    text
      .replace(/("(?:[^"\\]|\\.)*")|\/\/.*$|\/\*[\s\S]*?\*\//gm, (_, string) => string ?? "")
      .replace(/,(\s*[}\]])/g, "$1"),
  );
const LOCAL_ADDRESS = /localhost|127\.0\.0\.1|0\.0\.0\.0/;

const failures = [...findContractCopies(), ...findRatchetBreaks(), ...findAdrProblems()];

// oxfmt: `--all` checks the whole tree; the hook checks only the staged files. A staged
// file on the ignore list is no failure: oxfmt exits 2 with "Expected at least one target
// file" when every path it was given is ignored.
const FORMATTED_FILES = /\.(ts|tsx|js|mjs|css)$/;
const formatTargets = all
  ? ["**/*.{ts,tsx,js,mjs,css}"]
  : (baseFiles
      ? baseDiff(["--diff-filter=ACMR"])
      : git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]).split("\n")
    ).filter((f) => FORMATTED_FILES.test(f));
if (formatTargets.length > 0) {
  const format = spawnSync("pnpm", ["exec", "oxfmt", "--list-different", ...formatTargets], { encoding: "utf8" });
  if (format.error) failures.push(`format: could not run oxfmt: ${format.error.message}`);
  const unformatted = (format.stdout ?? "").split("\n").filter(Boolean);
  const onlyIgnored = format.status === 2 && /Expected at least one target file/.test(format.stderr + format.stdout);
  if (unformatted.length > 0) {
    const shown = unformatted.slice(0, TAIL_LINES).map((l) => `  ${l.slice(0, LINE_WIDTH)}`);
    const more = unformatted.length > TAIL_LINES ? [`  ...and ${unformatted.length - TAIL_LINES} more`] : [];
    failures.push(
      `format: ${unformatted.length} file(s) not formatted; run \`pnpm format\`\n${[...shown, ...more].join("\n")}`,
    );
  } else if (format.status !== 0 && !onlyIgnored) {
    failures.push(
      `format: oxfmt failed\n${(format.stderr || format.stdout).split("\n").filter(Boolean).slice(-TAIL_LINES).join("\n")}`,
    );
  }
}
for (const dir of folders("apps")) {
  const file = `${dir}/wrangler.jsonc`;
  if (!fs.existsSync(file)) continue;
  const config = jsonc(fs.readFileSync(file, "utf8"));
  const blocks = [
    ["vars", config.vars],
    ...Object.entries(config.env ?? {}).map(([name, env]) => [`env.${name}.vars`, env.vars]),
  ];
  for (const [where, vars] of blocks) {
    for (const [key, value] of Object.entries(vars ?? {})) {
      const parts = typeof value === "string" ? value.split(/[\s,]+/).filter(Boolean) : [];
      if (parts.length > 0 && parts.every((part) => LOCAL_ADDRESS.test(part)))
        failures.push(
          `${file}: ${where}.${key} is "${value}", an address on this machine only. A deploy writes it to the live Worker; keep local values in .dev.vars.`,
        );
    }
  }
}

const runCheck = (dir) =>
  new Promise((resolve) => {
    const projectStarted = Date.now();
    let output = "";
    const child = spawn("pnpm", ["--dir", dir, "run", "--if-present", "check"], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const finish = (status, extra = "") =>
      resolve({ dir, status, output: output + extra, ms: Date.now() - projectStarted });
    child.on("error", (error) => finish(1, `\n${error.message}`));
    child.on("close", (status) => finish(status));
  });

const runAll = async (dirs) => {
  const results = new Array(dirs.length);
  let next = 0;
  const worker = async () => {
    while (next < dirs.length) {
      const index = next++;
      results[index] = await runCheck(dirs[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(os.availableParallelism(), dirs.length) }, worker));
  return results;
};

const started = Date.now();
const results = await runAll(projects.filter((dir) => fs.existsSync(`${dir}/package.json`)));
const ran = results.length;
const timings = results.map((r) => `${r.dir}  ${(r.ms / 1000).toFixed(1)}s  ${r.status === 0 ? "ok" : "fail"}`);
for (const r of results) {
  if (r.status === 0) continue;
  const tail = r.output
    .split("\n")
    .filter(Boolean)
    .slice(-TAIL_LINES)
    .map((l) => l.slice(0, LINE_WIDTH));
  failures.push(`${r.dir}: check failed\n${tail.join("\n")}`);
}
if (process.env.CI) {
  console.log([...timings, `total  ${((Date.now() - started) / 1000).toFixed(1)}s`].join("\n"));
}
if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`check ok (${ran} projects)`);
