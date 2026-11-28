import { scanFiles, scanRunnerJobs, scans, tenantRunners } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { fakeBindings } from "#/__tests__/fake-bindings";
import { giveDataKey } from "#/__tests__/sealed-test-helpers";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { SEALED_OBJECT_KEY, SEALED_OBJECT_VERSION } from "#/modules/sealed-data/utils";

const StatusSchema = z.object({
  data: z.object({ error: z.string().nullable(), scopePaths: z.array(z.string()).optional() }),
});

let test: TestDb;
let acme: string;
let other: string;
let seal: Awaited<ReturnType<typeof giveDataKey>>;
const app = tenantRouteApp(() => test);

const statusOf = async (accountId: string, scanId: string) => {
  const res = await callAs(app, accountId, `/scans/${scanId}`);
  return StatusSchema.parse(await res.json()).data;
};

beforeAll(async () => {
  test = await openTestDb();
  const first = await seedTenant(test, "acme");
  acme = first.tenantId;
  other = (await seedTenant(test, "other")).tenantId;
  seal = await giveDataKey(test, acme);
  const repoId = await seedRepo(test, acme);
  const otherRepoId = await seedRepo(test, other);
  const [runner] = await test.raw
    .insert(tenantRunners)
    .values({ tenantId: acme, name: "mine", createdBy: first.partyId })
    .returning();
  await test.raw.insert(scans).values([
    scanValues(acme, repoId, "sealed-scan", "2026-11-01T00:00:00Z", {
      status: "failed",
      error: await seal("the agent hit a secret in src/payments.ts"),
    }),
    scanValues(acme, repoId, "plain-scan", "2026-11-02T00:00:00Z", { status: "failed", error: "plain failure" }),
    scanValues(other, otherRepoId, "copied-scan", "2026-11-03T00:00:00Z", {
      status: "failed",
      error: await seal("copied failure"),
    }),
  ]);
  await test.raw.insert(scanRunnerJobs).values({
    scanId: "sealed-scan",
    tenantId: acme,
    runnerId: runner.id,
    repoUrl: "https://github.com/octocat/Hello-World",
    prompt: await seal("prompt"),
    optionsJson: await seal(JSON.stringify({ scopePaths: ["src/payments"] })),
    priorsJson: await seal("[]"),
  });
  await test.raw.insert(scanFiles).values({
    tenantId: acme,
    scanId: "sealed-scan",
    name: "REPORT.md",
    r2Key: `accounts/${acme}/scans/sealed-scan/REPORT.md`,
    sizeBytes: 10,
    contentType: "text/markdown; charset=utf-8",
  });
});

afterAll(async () => {
  await test.close();
});

describe("GET /scans/:scanId with sealed and plain rows", () => {
  it("opens a sealed error and the sealed job options for its own Account", async () => {
    expect(await statusOf(acme, "sealed-scan")).toMatchObject({
      error: "the agent hit a secret in src/payments.ts",
      scopePaths: ["src/payments"],
    });
  });

  it("still reads a plain error", async () => {
    expect((await statusOf(acme, "plain-scan")).error).toBe("plain failure");
  });

  it("shows 'cannot be read' for a sealed error copied into another Account's row", async () => {
    expect((await statusOf(other, "copied-scan")).error).toBe("cannot be read");
  });
});

describe("GET /scans/:scanId/files/:file with a sealed report", () => {
  const readReport = async (bytes: ArrayBuffer | string, sealedFile: boolean) => {
    const reports = {
      get: async () => ({
        body: new Response(bytes).body,
        customMetadata: sealedFile ? { [SEALED_OBJECT_KEY]: SEALED_OBJECT_VERSION } : undefined,
        arrayBuffer: () => new Response(bytes).arrayBuffer(),
      }),
    };
    // SAFETY: the file route calls only get on the bucket.
    const bucket: R2Bucket = reports as never;
    const res = await callAs(app, acme, "/scans/sealed-scan/files/REPORT.md", {
      env: { ...fakeBindings().env, REPORTS: bucket },
    });
    return res.text();
  };

  it("opens a sealed report for its own Account", async () => {
    const sealed = await seal.bytes(await new Blob(["# Report"]).arrayBuffer());

    expect(await readReport(sealed, true)).toBe("# Report");
  });

  it("still serves a plain report", async () => {
    expect(await readReport("# Plain report", false)).toBe("# Plain report");
  });

  it("shows 'cannot be read', not the sealed bytes, when the report will not open", async () => {
    expect(await readReport("garbage bytes that are not sealed at all", true)).toBe("cannot be read");
  });
});
