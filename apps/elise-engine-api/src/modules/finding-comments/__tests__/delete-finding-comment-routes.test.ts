import { authUser } from "@repo/db-elise";
import {
  accessAuditLog,
  parties,
  partyMasterTypes,
  partyPersons,
  scanFindingComments,
  scanFindings,
  scans,
} from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { FindingThreadSchema, type AccessPower } from "@repo/contracts/elise";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";

let test: TestDb;
let tenantId: string;
let repoId: string;
let adaPartyId: string;
let boPartyId: string;
let signedIn: string | undefined;
let held: ReadonlySet<AccessPower>;

const FINGERPRINT = "a".repeat(64);
const REPO = "https://github.com/octocat/Hello-World";
const THREAD_URL = `/findings/comments?repo=${REPO}&fingerprint=${FINGERPRINT}`;
const MEMBER: ReadonlySet<AccessPower> = new Set<AccessPower>([
  "company:dashboard:read",
  "company:summary:read",
  "company:findings:comments:create",
]);
const ADMIN: ReadonlySet<AccessPower> = new Set<AccessPower>([...MEMBER, "company:findings:comments:delete"]);
const READER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:dashboard:read", "company:summary:read"]);
const WATCHER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:summary:read"]);

const app = tenantRouteApp(() => test, {
  sessionUserId: async () => signedIn,
  userHasPower: async (_c, _userId, _accountId, power) => held.has(power),
});

const call = (path: string, init: { method?: string; token?: boolean } = {}) => {
  const { env } = fakeBindings();
  const headers = new Headers({
    authorization: `Bearer ${init.token ? TEST_TOKEN : "session-token"}`,
    "x-account-id": tenantId,
  });
  return app.fetch(new Request(`http://localhost${path}`, { method: init.method, headers }), env, testExecutionContext);
};

const seedComment = async (authorPartyId: string | null, body = "a comment") => {
  const [row] = await test.raw
    .insert(scanFindingComments)
    .values({ tenantId, repoId, fingerprint: FINGERPRINT, authorPartyId, body })
    .returning();
  return row.id;
};

const remove = (commentId: string, token = false) =>
  call(`/findings/comments/${commentId}`, { method: "DELETE", token });

const thread = async () =>
  z
    .object({ data: FindingThreadSchema })
    .parse(await (await call(THREAD_URL, { token: true })).json())
    .data.events.filter((event) => event.kind === "comment");

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "acme");
  tenantId = seeded.tenantId;
  adaPartyId = seeded.partyId;
  repoId = await seedRepo(test, tenantId);
  await test.raw.insert(scans).values(scanValues(tenantId, repoId, "scan-1", "2026-11-01T00:00:00Z"));
  await test.raw.insert(scanFindings).values({
    tenantId,
    scanId: "scan-1",
    findingId: "F-1",
    fingerprint: FINGERPRINT,
    status: "confirmed",
    severity: "high",
    title: "a problem",
    class: "authz",
  });
  await test.raw
    .insert(authUser)
    .values({ id: "ada", name: "Ada Rossi", email: "ada@example.com", partyId: adaPartyId });
  const [type] = await test.raw.select().from(partyMasterTypes).where(eq(partyMasterTypes.key, "person"));
  const [bo] = await test.raw.insert(parties).values({ masterTypeId: type.id }).returning();
  boPartyId = bo.id;
  await test.raw.insert(partyPersons).values({ partyId: boPartyId, firstName: "Bo", lastName: "Chen" });
});

afterAll(async () => {
  await test.close();
});

beforeEach(async () => {
  signedIn = "ada";
  held = MEMBER;
  await test.raw.delete(scanFindingComments);
});

describe("who may delete a comment", () => {
  it("lets an author delete their own comment and leaves a marker with no body", async () => {
    const id = await seedComment(adaPartyId, "take this back");
    const res = await remove(id);
    const [event] = await thread();
    const [stored] = await test.raw.select().from(scanFindingComments);

    expect([res.status, event.id, event.body, event.deletedAt === null, stored.body, stored.deletedByPartyId]).toEqual([
      200,
      id,
      null,
      false,
      "",
      adaPartyId,
    ]);
  });

  it("lets a holder of the delete Power delete another member's comment", async () => {
    held = ADMIN;
    const id = await seedComment(boPartyId);
    const res = await remove(id);
    const [event] = await thread();

    expect([res.status, event.body, event.authorName, event.deletedAt === null]).toEqual([200, null, "Bo Chen", false]);
  });

  it("refuses a member who is neither the author nor holds the delete Power", async () => {
    const id = await seedComment(boPartyId, "not yours");
    const res = await remove(id);

    expect([res.status, (await thread()).map((event) => event.body)]).toEqual([403, ["not yours"]]);
  });

  it("refuses an author who no longer holds the create Power", async () => {
    held = READER;
    const id = await seedComment(adaPartyId, "mine");
    const res = await remove(id);

    expect([res.status, (await thread()).map((event) => event.body)]).toEqual([403, ["mine"]]);
  });

  it("refuses a Watcher", async () => {
    held = WATCHER;
    const id = await seedComment(adaPartyId);

    expect((await remove(id)).status).toBe(403);
  });

  it("refuses the service token, which names no one", async () => {
    signedIn = undefined;
    const id = await seedComment(adaPartyId);

    expect((await remove(id, true)).status).toBe(401);
  });
});

describe("what a delete leaves", () => {
  it("refuses a comment that is already deleted", async () => {
    const id = await seedComment(adaPartyId);
    await remove(id);

    expect((await remove(id)).status).toBe(409);
  });

  it("answers 404 for a comment that does not exist", async () => {
    expect((await remove(crypto.randomUUID())).status).toBe(404);
  });

  it("writes one Audit trail row naming the deleter, the comment and the Tenant", async () => {
    held = ADMIN;
    const id = await seedComment(boPartyId);
    await remove(id);
    const rows = await test.raw.select().from(accessAuditLog).where(eq(accessAuditLog.subjectId, id));

    expect(rows.map((row) => [row.action, row.actorPartyId, row.subjectId, row.after])).toEqual([
      ["finding.comment.deleted", adaPartyId, id, { tenantId }],
    ]);
  });

  it("writes no Audit trail row when the delete is refused", async () => {
    const id = await seedComment(boPartyId);
    await remove(id);

    expect(await test.raw.select().from(accessAuditLog).where(eq(accessAuditLog.subjectId, id))).toEqual([]);
  });
});
