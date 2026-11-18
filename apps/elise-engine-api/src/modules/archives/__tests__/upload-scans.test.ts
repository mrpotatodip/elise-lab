import { eq } from "drizzle-orm";
import { platformMasterPlans, scanArchiveLinks, scans, tenantSubscriptions } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";

let test: TestDb;
const app = tenantRouteApp(() => test);
const accountOf = new Map<string, string>();
const { env } = fakeBindings();

const RUNNER = "5b3f0d7e-61a4-4c2f-9d58-2f7a1c9e4b10";
const ZIP = new TextEncoder().encode("PK\u0003\u0004elise-test");
const ZIP_SHA256 = "0ff74677210e7084975f07543108ee9e9d3b01732f6e7f38ddb98bc055ec271d";
const EnvelopeSchema = z.object({ data: z.unknown() });
const IdSchema = z.object({ id: z.uuid() });
const QueuedSchema = z.object({ scanId: z.string() });
const ErrorSchema = z.object({ error: z.object({ message: z.string() }) });
const ScanArchiveSchema = z.object({ archive: z.object({ id: z.uuid().nullable(), label: z.string(), contentSha256: z.string() }).nullable() });

beforeAll(async () => {
  test = await openTestDb();
  const [pro] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "pro"));
  for (const name of ["acme", "other"]) {
    const { tenantId } = await seedTenant(test, name);
    accountOf.set(name, tenantId);
    await test.raw.insert(tenantSubscriptions).values({ tenantId, planId: pro.id, status: "active", source: "grant" });
  }
});

afterAll(async () => {
  await test.close();
});

const send = (account: string, path: string, init: { method?: string; json?: unknown; body?: Uint8Array } = {}) => {
  const headers = { authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": accountOf.get(account) ?? "", "content-type": init.body ? "application/zip" : "application/json" };
  const body = init.body ?? (init.json === undefined ? undefined : JSON.stringify(init.json));
  return app.fetch(new Request(`http://localhost${path}`, { method: init.method, headers, body }), env, testExecutionContext);
};

const dataOf = async (res: Response) => EnvelopeSchema.parse(await res.json()).data;

const newApp = async (account: string, name: string) => IdSchema.parse(await dataOf(await send(account, "/repos", { method: "POST", json: { provider: "upload", repo: name } }))).id;

const uploadZip = async (account: string, appId: string, label: string) =>
  IdSchema.parse(await dataOf(await send(account, `/repos/${appId}/archives?label=${encodeURIComponent(label)}`, { method: "POST", body: ZIP }))).id;

type UploadScanBody = { repo: string; archive_id?: string; ref?: string; runner_id?: string };

const scanUpload = (account: string, body: UploadScanBody) => send(account, "/scans", { method: "POST", json: { provider: "upload", runner_id: RUNNER, ...body } });

describe("POST /scans for an upload app", () => {
  it("links the Scan to the zip it reads, on the app's hidden Branch, with the zip's hash as its commit", async () => {
    const appId = await newApp("acme", "Linked");
    const archiveId = await uploadZip("acme", appId, "app-1.2.zip");

    const res = await scanUpload("acme", { repo: "Linked", archive_id: archiveId });
    const { scanId } = QueuedSchema.parse(await dataOf(res));
    const [link] = await test.raw.select().from(scanArchiveLinks).where(eq(scanArchiveLinks.scanId, scanId));
    const [scan] = await test.raw.select({ repoId: scans.repoId, branch: scans.branch, commitSha: scans.commitSha }).from(scans).where(eq(scans.id, scanId));

    expect({ status: res.status, link: { archiveId: link?.archiveId, label: link?.label, contentSha256: link?.contentSha256 }, scan }).toEqual({
      status: 201,
      link: { archiveId, label: "app-1.2.zip", contentSha256: ZIP_SHA256 },
      scan: { repoId: appId, branch: "upload", commitSha: ZIP_SHA256 },
    });
  });

  it("answers the app's Verdict for a zip, asked by the zip's hash", async () => {
    const appId = await newApp("acme", "Judged");

    const res = await send("acme", `/repos/${appId}/verdict?commit=${ZIP_SHA256}`);

    expect({ status: res.status, commit: z.object({ commit: z.string() }).parse(await dataOf(res)).commit }).toEqual({ status: 200, commit: ZIP_SHA256 });
  });

  it.each([
    ["no zip", { repo: "Rules" }, "archive_id"],
    ["a branch", { repo: "Rules", archive_id: "7a2e1d0c-3b4f-4a51-8c62-9d03e4f5a6b7", ref: "main" }, "ref"],
    ["no Runner", { repo: "Rules", archive_id: "7a2e1d0c-3b4f-4a51-8c62-9d03e4f5a6b7", runner_id: undefined }, "runner_id"],
  ])("refuses an upload Scan with %s, and starts nothing", async (_label, body, field) => {
    const res = await scanUpload("acme", body);

    expect({ status: res.status, message: ErrorSchema.parse(await res.json()).error.message }).toEqual({ status: 400, message: expect.stringContaining(field) });
  });

  it("refuses a zip on a GitHub Scan", async () => {
    const res = await send("acme", "/scans", { method: "POST", json: { repo: "https://github.com/octocat/Hello-World", archive_id: "7a2e1d0c-3b4f-4a51-8c62-9d03e4f5a6b7" } });

    expect(res.status).toBe(400);
  });

  it("refuses a zip of another app or another Account, and writes no Scan", async () => {
    const mine = await newApp("acme", "Mine");
    const theirApp = await newApp("other", "Mine");
    const otherApp = await newApp("acme", "Other app");
    const theirs = await uploadZip("other", theirApp, "theirs.zip");
    const elsewhere = await uploadZip("acme", otherApp, "elsewhere.zip");

    const statuses = [(await scanUpload("acme", { repo: "Mine", archive_id: theirs })).status, (await scanUpload("acme", { repo: "Mine", archive_id: elsewhere })).status];
    const written = await test.raw.select({ id: scans.id }).from(scans).where(eq(scans.repoId, mine));

    expect({ statuses, written }).toEqual({ statuses: [400, 400], written: [] });
  });

  it("keeps the Scan in the History when its zip is removed, with the zip's label and no file", async () => {
    const appId = await newApp("acme", "Removed");
    const archiveId = await uploadZip("acme", appId, "app-2.0.zip");
    const { scanId } = QueuedSchema.parse(await dataOf(await scanUpload("acme", { repo: "Removed", archive_id: archiveId })));

    const removed = await send("acme", `/repos/${appId}/archives/${archiveId}`, { method: "DELETE" });
    const detail = ScanArchiveSchema.parse(await dataOf(await send("acme", `/scans/${scanId}`)));

    expect({ removed: removed.status, archive: detail.archive }).toEqual({ removed: 200, archive: { id: null, label: "app-2.0.zip", contentSha256: ZIP_SHA256 } });
  });
});
