import { scanFindingComments } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { giveDataKey } from "#/__tests__/sealed-test-helpers";
import { openTestDb, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";

const REPO = "https://github.com/octocat/Hello-World";
const FINGERPRINT = "a".repeat(64);
const ThreadSchema = z.object({ data: z.object({ events: z.array(z.object({ body: z.string().nullable() })) }) });

let test: TestDb;
let acme: string;
let other: string;
const app = tenantRouteApp(() => test);

const threadBodies = async (accountId: string) => {
  const res = await callAs(app, accountId, `/findings/comments?repo=${REPO}&fingerprint=${FINGERPRINT}`);
  return ThreadSchema.parse(await res.json()).data.events.map((event) => event.body);
};

beforeAll(async () => {
  test = await openTestDb();
  acme = (await seedTenant(test, "acme")).tenantId;
  other = (await seedTenant(test, "other")).tenantId;
  const seal = await giveDataKey(test, acme);
  const acmeRepo = await seedRepo(test, acme, REPO);
  const otherRepo = await seedRepo(test, other, REPO);
  await test.raw.insert(scanFindingComments).values([
    {
      tenantId: acme,
      repoId: acmeRepo,
      fingerprint: FINGERPRINT,
      body: await seal("sealed comment"),
      createdAt: new Date("2026-11-01T00:00:00Z"),
    },
    {
      tenantId: acme,
      repoId: acmeRepo,
      fingerprint: FINGERPRINT,
      body: "plain comment",
      createdAt: new Date("2026-11-02T00:00:00Z"),
    },
    { tenantId: other, repoId: otherRepo, fingerprint: FINGERPRINT, body: await seal("copied comment") },
  ]);
});

afterAll(async () => {
  await test.close();
});

describe("GET /findings/comments with sealed and plain rows", () => {
  it("opens a sealed Comment for its own Account and still reads a plain one", async () => {
    expect(await threadBodies(acme)).toEqual(["sealed comment", "plain comment"]);
  });

  it("shows 'cannot be read' for a sealed Comment copied into another Account's row", async () => {
    expect(await threadBodies(other)).toEqual(["cannot be read"]);
  });
});
