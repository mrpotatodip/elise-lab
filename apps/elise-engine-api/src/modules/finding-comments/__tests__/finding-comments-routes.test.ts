import { authUser } from "@repo/db-elise";
import { parties, partyMasterTypes, partyPersons, scanFindingComments, scanFindings, scans } from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { FINDING_COMMENT_BODY_MAX, FindingThreadSchema, type AccessPower } from "@repo/contracts/elise";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";

let test: TestDb;
let tenantId: string;
let repoId: string;
let signedIn: string | undefined;
let held: ReadonlySet<AccessPower>;

const FINGERPRINT = "a".repeat(64);
const REPO = "https://github.com/octocat/Hello-World";
const THREAD_URL = `/findings/comments?repo=${REPO}&fingerprint=${FINGERPRINT}`;
const MEMBER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:dashboard:read", "company:summary:read", "company:findings:comments:create"]);
const READER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:dashboard:read", "company:summary:read"]);
const WATCHER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:summary:read"]);

const app = tenantRouteApp(() => test, {
  sessionUserId: async () => signedIn,
  userHasPower: async (_c, _userId, _accountId, power) => held.has(power),
});

const call = (path: string, init: { method?: string; body?: unknown; token?: boolean } = {}) => {
  const { env } = fakeBindings();
  const headers = new Headers({ authorization: `Bearer ${init.token ? TEST_TOKEN : "session-token"}`, "x-account-id": tenantId, "content-type": "application/json" });
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return app.fetch(new Request(`http://localhost${path}`, { method: init.method, headers, body }), env, testExecutionContext);
};

const post = (body: string, token = false) => call("/findings/comments", { method: "POST", body: { repo: REPO, fingerprint: FINGERPRINT, body }, token });

const threadBodies = async () => {
  const { data } = z.object({ data: FindingThreadSchema }).parse(await (await call(THREAD_URL, { token: true })).json());
  return data.events.map((event) => event.body);
};

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "acme");
  tenantId = seeded.tenantId;
  repoId = await seedRepo(test, tenantId);
  await test.raw.insert(scans).values(scanValues(tenantId, repoId, "scan-1", "2026-11-01T00:00:00Z"));
  await test.raw.insert(scanFindings).values({ tenantId, scanId: "scan-1", findingId: "F-1", fingerprint: FINGERPRINT, status: "confirmed", severity: "high", title: "a problem", class: "authz" });
  await test.raw.insert(authUser).values({ id: "ada", name: "Ada Rossi", email: "ada@example.com", partyId: seeded.partyId });
});

afterAll(async () => {
  await test.close();
});

beforeEach(async () => {
  signedIn = "ada";
  held = MEMBER;
  await test.raw.delete(scanFindingComments);
});

describe("who may read and write a thread", () => {
  it("lets a member with the create Power write a comment and read it back with the author's name", async () => {
    const res = await post("Fixed in the next release.");
    const thread = z.object({ data: FindingThreadSchema }).parse(await (await call(THREAD_URL)).json()).data;

    expect([res.status, thread.events.map((event) => [event.body, event.authorName])]).toEqual([201, [["Fixed in the next release.", "Ada Rossi"]]]);
  });

  it("lets a login without the create Power read the thread and refuses its comment", async () => {
    held = READER;
    const read = await call(THREAD_URL);
    const write = await post("I may not.");

    expect([read.status, write.status, await threadBodies()]).toEqual([200, 403, []]);
  });

  it("refuses a Watcher on both the read and the write", async () => {
    held = WATCHER;
    const read = await call(THREAD_URL);
    const write = await post("I only watch.");

    expect([read.status, write.status]).toEqual([403, 403]);
  });

  it("lets the service token read and refuses it when it writes", async () => {
    signedIn = undefined;
    const read = await call(THREAD_URL, { token: true });
    const write = await post("No author.", true);

    expect([read.status, write.status]).toEqual([200, 401]);
  });
});

describe("what a comment may hold", () => {
  it.each([
    [FINDING_COMMENT_BODY_MAX, 201],
    [FINDING_COMMENT_BODY_MAX + 1, 400],
  ])("answers a body of %i characters with %i", async (length, status) => {
    expect((await post("x".repeat(length))).status).toBe(status);
  });

  it("refuses a comment on a fingerprint the Repo does not have", async () => {
    const res = await call("/findings/comments", { method: "POST", body: { repo: REPO, fingerprint: "c".repeat(64), body: "Nothing here." } });

    expect(res.status).toBe(404);
  });
});

describe("what a thread keeps", () => {
  it("shows the comments oldest first after a new Scan of the same Repo", async () => {
    await post("first");
    await post("second");
    await test.raw.insert(scans).values(scanValues(tenantId, repoId, "scan-2", "2026-11-02T00:00:00Z"));
    await test.raw.insert(scanFindings).values({ tenantId, scanId: "scan-2", findingId: "F-1", fingerprint: FINGERPRINT, status: "confirmed", severity: "high", title: "a problem", class: "authz" });

    expect(await threadBodies()).toEqual(["first", "second"]);
  });

  it("shows a comment whose author Party was removed with no name", async () => {
    const [type] = await test.raw.select().from(partyMasterTypes).where(eq(partyMasterTypes.key, "person"));
    const [gone] = await test.raw.insert(parties).values({ masterTypeId: type.id }).returning();
    await test.raw.insert(partyPersons).values({ partyId: gone.id, firstName: "Gone", lastName: "Person" });
    await test.raw.insert(scanFindingComments).values({ tenantId, repoId, fingerprint: FINGERPRINT, authorPartyId: gone.id, body: "left behind" });
    await test.raw.delete(parties).where(eq(parties.id, gone.id));

    const thread = z.object({ data: FindingThreadSchema }).parse(await (await call(THREAD_URL, { token: true })).json()).data;

    expect(thread.events.map((event) => [event.body, event.authorName])).toEqual([["left behind", null]]);
  });
});
