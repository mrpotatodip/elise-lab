import { scanFiles, scans } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { branchIdOf, openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";

let test: TestDb;
let tenantId: string;

const app = tenantRouteApp(() => test);

const ListBodySchema = z.object({ data: z.object({ scans: z.array(z.object({ scanId: z.string() })) }) });
const DetailBodySchema = z.object({
  data: z.object({ scanId: z.string(), skill: z.string(), files: z.array(z.string()) }),
});
const DiffBodySchema = z.object({ data: z.object({ scanId: z.string(), previousScanId: z.string().nullable() }) });

beforeAll(async () => {
  test = await openTestDb();
  tenantId = (await seedTenant(test, "acme")).tenantId;
  const repoId = await seedRepo(test, tenantId);
  const branchId = await branchIdOf(test, repoId);
  await test.raw
    .insert(scans)
    .values([
      scanValues(tenantId, repoId, "older", "2026-11-01T00:00:00Z", { branchId }),
      scanValues(tenantId, repoId, "newer", "2026-11-02T00:00:00Z", { branchId }),
    ]);
  await test.raw.insert(scanFiles).values({
    tenantId,
    scanId: "newer",
    name: "REPORT.md",
    r2Key: `accounts/${tenantId}/scans/newer/REPORT.md`,
    sizeBytes: 8,
    contentType: "text/markdown; charset=utf-8",
  });
});

afterAll(async () => {
  await test.close();
});

describe("the Scan read routes as one account", () => {
  it("list the account's Scans and read one with its files, an old lite row included", async () => {
    const list = ListBodySchema.parse(await (await callAs(app, tenantId, "/scans")).json());
    const detail = DetailBodySchema.parse(await (await callAs(app, tenantId, "/scans/newer")).json());

    expect(list.data.scans.map((scan) => scan.scanId).toSorted()).toEqual(["newer", "older"]);
    expect(detail.data).toMatchObject({ scanId: "newer", skill: "lite", files: ["REPORT.md"] });
  });

  it("compare a Scan with the previous one of its Branch", async () => {
    const diff = DiffBodySchema.parse(await (await callAs(app, tenantId, "/scans/newer/diff")).json());

    expect(diff.data).toEqual(expect.objectContaining({ scanId: "newer", previousScanId: "older" }));
  });

  it("serve a saved file as a safe attachment", async () => {
    const { env, store } = fakeBindings();
    store.set(`accounts/${tenantId}/scans/newer/REPORT.md`, "# report");
    const headers = { authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": tenantId };
    const res = await app.fetch(
      new Request("http://localhost/scans/newer/files/REPORT.md", { headers }),
      env,
      testExecutionContext,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("# report");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="REPORT.md"');
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
