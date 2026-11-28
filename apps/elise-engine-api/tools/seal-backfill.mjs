#!/usr/bin/env node
// pnpm --filter elise-engine-api seal:backfill [--dry] [--batch N] [--max-batches N] [--account ID]
// Seals the old plain rows and R2 objects of every Account (ADR 0018, step 3).
// Resumable: run it again after a stop. A person runs it, never an agent.
// Needs, in the environment or in packages/db-elise/.env: DATABASE_URL (owner),
// DATA_MASTER_KEY (the Worker's), and for R2 over the S3 API: R2_ACCOUNT_ID,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (R2_BUCKET defaults to repo-scan-reports).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = fs.readFileSync(path.resolve(appDir, "../../packages/db-elise/.env"), "utf8");
  return env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, "");
};

const missing = ["DATA_MASTER_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter(
  (name) => !process.env[name],
);
if (missing.length > 0) {
  console.error(`Set ${missing.join(", ")} in the environment.`);
  process.exit(2);
}

const run = spawnSync("pnpm", ["exec", "vitest", "run", "-c", "vitest.live.config.ts", "--reporter=dot"], {
  cwd: appDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_NO_WARNINGS: "1",
    LIVE_DATABASE_URL: databaseUrl(),
    SEAL_DRY: flag("--dry") ? "1" : "0",
    SEAL_BATCH: value("--batch") ?? "50",
    SEAL_MAX_BATCHES: value("--max-batches") ?? "",
    SEAL_ACCOUNT: value("--account") ?? "",
  },
});
process.exit(run.status ?? 1);
