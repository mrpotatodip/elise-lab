import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { expect, it } from "vitest";
import { createTenantDb } from "@repo/db-elise/client";
import * as schema from "@repo/db-elise/schema";
import { effectInCallback } from "#/lib/effect-query";
import { sealBackfillEffect, type BackfillDeps } from "#/modules/sealed-data";
import { r2OverS3 } from "./r2-s3";

// -----
// The sealed-data backfill against the database in LIVE_DATABASE_URL,
// started by tools/seal-backfill.mjs. Each batch is one transaction
// of the elise_app role with app.tenant_id set, so a batch cannot
// touch another Account's rows. Options come in as SEAL_* variables.
// -----
it("seals the old rows and objects of every Account", async () => {
  const env = process.env;
  const url = env.LIVE_DATABASE_URL;
  if (!url) throw new Error("run it through tools/seal-backfill.mjs");
  const { db, connect, close } = createTenantDb(url);
  await connect();
  const reports = r2OverS3(
    env.R2_ACCOUNT_ID ?? "",
    env.R2_BUCKET ?? "repo-scan-reports",
    env.R2_ACCESS_KEY_ID ?? "",
    env.R2_SECRET_ACCESS_KEY ?? "",
  );
  const deps: BackfillDeps = {
    listAccounts: Effect.promise(async () =>
      (await db.select({ id: schema.tenants.id }).from(schema.tenants).orderBy(schema.tenants.id)).map((row) => row.id),
    ),
    inAccount: (accountId, make) =>
      effectInCallback(
        (callback) =>
          db.transaction(async (tx) => {
            await tx.execute(sql`set local role elise_app`);
            await tx.execute(sql`select set_config('app.tenant_id', ${accountId}, true)`);
            return callback(tx);
          }),
        make,
      ),
    // SAFETY: the backfill calls only head, get and put, and the S3 adapter answers those the way R2 does.
    reports: reports as never,
    masterKey: env.DATA_MASTER_KEY,
    onBatch: (line) => process.stdout.write(`${line}\n`),
  };
  try {
    const summary = await Effect.runPromise(
      sealBackfillEffect(deps, {
        batchSize: Number(env.SEAL_BATCH ?? "50"),
        dry: env.SEAL_DRY === "1",
        maxBatches: env.SEAL_MAX_BATCHES ? Number(env.SEAL_MAX_BATCHES) : undefined,
        accountId: env.SEAL_ACCOUNT || undefined,
      }),
    );
    process.stdout.write(`${env.SEAL_DRY === "1" ? "DRY RUN " : ""}${JSON.stringify(summary)}\n`);
    expect(summary.stopped || summary.failed === 0).toBe(true);
  } finally {
    await close();
  }
}, 7_200_000);
