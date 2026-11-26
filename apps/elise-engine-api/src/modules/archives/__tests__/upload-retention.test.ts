import { eq } from "drizzle-orm";
import { scanArchiveLinks, scanRepos, scans, scanUploadArchives } from "@repo/db-elise/schema";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeBindings } from "#/__tests__/fake-bindings";
import { openTestDb, scanValues, seedTenant, type TestDb } from "#/__tests__/test-db";
import { sweepUploadsSvc } from "#/modules/archives/handlers";

let test: TestDb;
let tenantId = "";
let appId = "";

beforeAll(async () => {
  test = await openTestDb();
  tenantId = (await seedTenant(test, "acme")).tenantId;
  const [created] = await test.raw
    .insert(scanRepos)
    .values({ tenantId, provider: "upload", host: null, canonical: "billing", url: "Billing", defaultBranch: "upload" })
    .returning();
  appId = created.id;
});

afterAll(async () => {
  await test.close();
});

const NOW = new Date("2026-11-19T03:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

describe("the upload retention sweep", () => {
  it("deletes a zip no Scan read 30 days after upload, file and row, and keeps a scanned one, a young one and their files", async () => {
    const { env, store, uploadedAt } = fakeBindings();
    const zips = { unscannedOld: daysAgo(31), scannedOld: daysAgo(31), unscannedYoung: daysAgo(29) };
    const keyOf = (label: string) => `accounts/${tenantId}/uploads/${appId}/${label}.zip`;
    for (const [label, at] of Object.entries(zips)) {
      await test.raw.insert(scanUploadArchives).values({
        tenantId,
        repoId: appId,
        label,
        r2Key: keyOf(label),
        sizeBytes: 10,
        contentSha256: "c".repeat(64),
        uploadedAt: at,
      });
      store.set(keyOf(label), "zip");
      uploadedAt.set(keyOf(label), at);
    }
    const [scanned] = await test.raw
      .select({ id: scanUploadArchives.id })
      .from(scanUploadArchives)
      .where(eq(scanUploadArchives.label, "scannedOld"));
    await test.raw.insert(scans).values(scanValues(tenantId, appId, "scan-read-it", daysAgo(30).toISOString()));
    await test.raw.insert(scanArchiveLinks).values({
      scanId: "scan-read-it",
      tenantId,
      archiveId: scanned.id,
      label: "scannedOld",
      contentSha256: "c".repeat(64),
    });

    const swept = await Effect.runPromise(sweepUploadsSvc(test.pool, env.REPORTS, NOW));
    const rows = await test.raw.select({ label: scanUploadArchives.label }).from(scanUploadArchives);

    expect({
      swept: swept.expired,
      rows: rows.map((row) => row.label).toSorted(),
      files: [...store.keys()].toSorted(),
    }).toEqual({
      swept: 1,
      rows: ["scannedOld", "unscannedYoung"],
      files: [keyOf("scannedOld"), keyOf("unscannedYoung")],
    });
  });

  it("deletes a stored object with no row once it is a day old, and leaves a newer one, whose upload may still be committing", async () => {
    const { env, store, uploadedAt } = fakeBindings();
    const stale = `accounts/${tenantId}/uploads/${appId}/never-committed.zip`;
    const fresh = `accounts/${tenantId}/uploads/${appId}/committing.zip`;
    store.set(stale, "zip");
    uploadedAt.set(stale, daysAgo(2));
    store.set(fresh, "zip");
    uploadedAt.set(fresh, new Date(NOW.getTime() - 60_000));

    const swept = await Effect.runPromise(sweepUploadsSvc(test.pool, env.REPORTS, NOW));

    expect({ orphans: swept.orphans, files: [...store.keys()] }).toEqual({ orphans: 1, files: [fresh] });
  });
});
