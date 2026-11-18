import { scanUploadArchives } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { zipOf } from "#/__tests__/zip-fixture";

let test: TestDb;
const app = tenantRouteApp(() => test);
let accountId = "";

beforeAll(async () => {
  test = await openTestDb();
  accountId = (await seedTenant(test, "acme")).tenantId;
});

afterAll(async () => {
  await test.close();
});

const IdSchema = z.object({ data: z.object({ id: z.uuid() }) });
const RefusalSchema = z.object({ data: z.null(), error: z.object({ message: z.string() }) });
const MB = 1024 * 1024;

type Env = ReturnType<typeof fakeBindings>["env"];
type SendInit = { method?: string; json?: unknown; body?: Uint8Array; as?: string; env?: Env };

const send = (path: string, init: SendInit = {}) => {
  const headers = { authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": init.as ?? accountId, "content-type": init.body ? "application/zip" : "application/json" };
  const body = init.body ?? (init.json === undefined ? undefined : JSON.stringify(init.json));
  return app.fetch(new Request(`http://localhost${path}`, { method: init.method, headers, body }), init.env ?? fakeBindings().env, testExecutionContext);
};

const newApp = async (name: string, as?: string) => IdSchema.parse(await (await send("/repos", { method: "POST", json: { provider: "upload", repo: name }, as })).json()).data.id;

const upload = (appId: string, bytes: Uint8Array, init: Pick<SendInit, "as" | "env"> = {}) => send(`/repos/${appId}/archives?label=app.zip`, { method: "POST", body: bytes, ...init });

const refusalOf = async (res: Response) => ({ status: res.status, message: RefusalSchema.parse(await res.json()).error.message });

describe("the upload limits", () => {
  it("refuses a zip over 50 MB, naming the limit", async () => {
    const appId = await newApp("Too big");
    const bytes = new Uint8Array(50 * MB + 1);
    bytes.set([0x50, 0x4b, 0x03, 0x04]);

    expect(await refusalOf(await upload(appId, bytes))).toEqual({ status: 413, message: expect.stringContaining("50 MB") });
  });

  it.each([
    ["more than 20,000 files", Array.from({ length: 20_001 }, (_, index) => ({ name: `src/f${index}.ts` })), "20,000 files"],
    ["a path 21 levels deep", [{ name: `${"d/".repeat(20)}deep.ts` }], "20 levels"],
    ["more than 250 MB unpacked", [{ name: "a.bin", claimedSize: 200 * MB }, { name: "b.bin", claimedSize: 51 * MB }], "250 MB"],
  ])("refuses a zip with %s, naming the limit, and stores nothing", async (_label, entries, limit) => {
    const { env, store } = fakeBindings();
    const appId = await newApp(`Over ${crypto.randomUUID()}`);

    const res = await upload(appId, zipOf(entries), { env });

    expect({ ...(await refusalOf(res)), stored: store.size }).toEqual({ status: 400, message: expect.stringContaining(limit), stored: 0 });
  });

  it("takes a zip at the limits: a path 20 levels deep", async () => {
    const appId = await newApp("At the limits");

    const res = await upload(appId, zipOf([{ name: `${"d/".repeat(19)}deep.ts`, text: "x" }]));

    expect(res.status).toBe(201);
  });

  it("refuses a 21st zip in one app, naming the limit", async () => {
    const appId = await newApp("Twenty");
    for (let index = 0; index < 20; index += 1) await upload(appId, zipOf([{ name: `v${index}/a.ts`, text: "x" }]));

    expect(await refusalOf(await upload(appId, zipOf([{ name: "v20/a.ts", text: "x" }])))).toEqual({ status: 409, message: expect.stringContaining("20 zips") });
  });

  it("refuses a zip that takes the Account past 500 MB of stored zips, naming the limit", async () => {
    const { tenantId } = await seedTenant(test, "full");
    const appId = await newApp("Full", tenantId);
    const nearlyFull = await newApp("Nearly full", tenantId);
    await test.raw.insert(scanUploadArchives).values({
      tenantId,
      repoId: nearlyFull,
      label: "big.zip",
      r2Key: `accounts/${tenantId}/uploads/${nearlyFull}/big.zip`,
      sizeBytes: 500 * MB - 10,
      contentSha256: "a".repeat(64),
    });

    const refused = await refusalOf(await upload(appId, zipOf([{ name: "a.ts", text: "x" }]), { as: tenantId }));

    expect(refused).toEqual({ status: 409, message: expect.stringContaining("500 MB") });
  });
});
