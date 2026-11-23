#!/usr/bin/env node
// pnpm rls:latency [--warm 50] [--cold 5] [--idle 30] [--account ID]
// Times the deployed Worker from here (#62): tenant routes that
// run through withTenant (Hyperdrive, elise_app, one transaction)
// against a baseline that passes auth and fails validation before
// any database call. The gap is what withTenant costs a request.
// Warm: requests back to back after a warm-up. Cold: the first
// request after --idle seconds without traffic. Needs the deployed
// Worker's SCAN_API_TOKEN in the env. Read-only.
import { accountId, engineUrl, parseArgs } from "./engine-call.mjs";

const { flags } = parseArgs(process.argv.slice(2));
const warm = Number(flags.warm ?? 50);
const cold = Number(flags.cold ?? 5);
const idle = Number(flags.idle ?? 30);
const token = process.env.SCAN_API_TOKEN;
if (!token) {
  console.error("Set SCAN_API_TOKEN to the deployed Worker's secret.");
  process.exit(1);
}
const base = engineUrl(flags);
const account = accountId(flags);

const PATHS = {
  "baseline (no db)": "/repos/not-a-uuid",
  "GET /findings (withTenant)": "/findings",
  "GET /repos (withTenant)": "/repos",
  "GET /usage/credit (withTenant)": "/usage/credit",
};

async function time(path) {
  const started = performance.now();
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}`, "x-account-id": account } });
  await res.arrayBuffer();
  const ms = performance.now() - started;
  if (res.status === 401) throw new Error("401: SCAN_API_TOKEN is not the deployed Worker's secret.");
  return { ms, status: res.status };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const summary = (samples) => {
  const sorted = [...samples].sort((x, y) => x - y);
  return `p50 ${pct(sorted, 50).toFixed(0)} ms, p95 ${pct(sorted, 95).toFixed(0)} ms (n=${sorted.length})`;
};

const results = Object.fromEntries(Object.keys(PATHS).map((name) => [name, { warm: [], cold: [], status: new Set() }]));

console.error(`${base}, account ${account}`);
for (const [name, path] of Object.entries(PATHS)) {
  for (let i = 0; i < 3; i += 1) results[name].status.add((await time(path)).status);
}
// Interleave the paths so drift in the network hits all of them alike.
for (let i = 0; i < warm; i += 1) {
  for (const [name, path] of Object.entries(PATHS)) results[name].warm.push((await time(path)).ms);
}
for (let round = 0; round < cold; round += 1) {
  for (const [name, path] of Object.entries(PATHS)) {
    console.error(`cold ${round + 1}/${cold}: ${name}, waiting ${idle} s`);
    await new Promise((resolve) => setTimeout(resolve, idle * 1000));
    results[name].cold.push((await time(path)).ms);
  }
}

for (const [name, r] of Object.entries(results)) {
  console.log(`${name} [status ${[...r.status].join(",")}]`);
  console.log(`  warm: ${summary(r.warm)}`);
  if (r.cold.length > 0) console.log(`  cold: ${summary(r.cold)}`);
}
