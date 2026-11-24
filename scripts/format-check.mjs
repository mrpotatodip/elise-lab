#!/usr/bin/env node
// Lists the files oxfmt would change, counted per project. Writes nothing; exits 1 when any file differs.
import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["exec", "oxfmt", "--list-different", "**/*.{ts,tsx,js,mjs,css}"], {
  encoding: "utf8",
});
const files = result.stdout.split("\n").filter(Boolean);
if (files.length === 0 && result.status === 0) {
  console.log("format: every file is formatted");
  process.exit(0);
}
if (files.length === 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const projectOf = (file) => {
  const [top, name] = file.split("/");
  return top === "apps" || top === "packages" ? `${top}/${name}` : top;
};
const counts = new Map();
for (const file of files) counts.set(projectOf(file), (counts.get(projectOf(file)) ?? 0) + 1);
for (const [project, count] of [...counts].sort()) console.log(`${String(count).padStart(5)}  ${project}`);
console.log(`${String(files.length).padStart(5)}  would change (run \`pnpm format\` to rewrite)`);
process.exit(1);
