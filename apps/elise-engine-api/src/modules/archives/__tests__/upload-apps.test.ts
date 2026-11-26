import { eq } from "drizzle-orm";
import { authUser } from "@repo/db-elise";
import { accessAuditLog, scanRepoBranches, scanRepos, scans, scanUploadArchives } from "@repo/db-elise/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { AccessPower } from "@repo/contracts/elise";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, scanValues, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { zipOf } from "#/__tests__/zip-fixture";

const DataSchema = z.object({ data: z.record(z.string(), z.unknown()) });

let test: TestDb;
let held: ReadonlySet<AccessPower>;
const REMOVER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:repos:delete"]);
const app = tenantRouteApp(() => test, {
  sessionUserId: async () => "ada",
  userHasPower: async (_c, _userId, _accountId, power) => held.has(power),
});
const accountOf = new Map<string, string>();
const partyOf = new Map<string, string>();

beforeAll(async () => {
  test = await openTestDb();
  for (const name of ["acme", "other"]) {
    const seeded = await seedTenant(test, name);
    accountOf.set(name, seeded.tenantId);
    partyOf.set(name, seeded.partyId);
  }
  await test.raw
    .insert(authUser)
    .values({ id: "ada", name: "Ada Rossi", email: "ada@example.com", partyId: partyOf.get("acme") ?? "" });
});

beforeEach(() => {
  held = REMOVER;
});

afterAll(async () => {
  await test.close();
});

const call = async (account: string, path: string, init: { method?: string; json?: unknown } = {}) => {
  const { env } = fakeBindings();
  const headers = {
    authorization: `Bearer ${TEST_TOKEN}`,
    "x-account-id": accountOf.get(account) ?? "",
    "content-type": "application/json",
  };
  const body = init.json === undefined ? undefined : JSON.stringify(init.json);
  return app.fetch(
    new Request(`http://localhost${path}`, { method: init.method, headers, body }),
    env,
    testExecutionContext,
  );
};

// -----
// A zip of one file; its SHA-256 was taken with Python's hashlib
// on the same bytes.
// -----
const ZIP = zipOf([{ name: "app/README.md", text: "elise-test" }]);
const ZIP_SHA256 = "3ff652db2f06f3e24d5eb0824d3e1ee38401754fe10663f374417be55ce39061";
const ArchiveSchema = z.object({ id: z.uuid(), label: z.string(), sizeBytes: z.number(), contentSha256: z.string() });
const ArchivesSchema = z.object({ archives: z.array(ArchiveSchema) });
const EnvelopeSchema = z.object({ data: z.unknown() });
const dataOf = async (res: Response) => EnvelopeSchema.parse(await res.json()).data;

type Env = ReturnType<typeof fakeBindings>["env"];

const send = (
  env: Env,
  account: string,
  path: string,
  init: { method?: string; body?: Uint8Array; contentType?: string } = {},
) => {
  const headers = {
    authorization: `Bearer ${TEST_TOKEN}`,
    "x-account-id": accountOf.get(account) ?? "",
    "content-type": init.contentType ?? "application/json",
  };
  return app.fetch(
    new Request(`http://localhost${path}`, { method: init.method, headers, body: init.body }),
    env,
    testExecutionContext,
  );
};

const upload = (env: Env, account: string, appId: string, label: string, bytes: Uint8Array) =>
  send(env, account, `/repos/${appId}/archives?label=${encodeURIComponent(label)}`, {
    method: "POST",
    body: bytes,
    contentType: "application/zip",
  });

const newApp = async (account: string, name: string) =>
  z
    .uuid()
    .parse(
      DataSchema.parse(
        await (await call(account, "/repos", { method: "POST", json: { provider: "upload", repo: name } })).json(),
      ).data.id,
    );

const appsOf = (account: string) =>
  test.raw
    .select({
      provider: scanRepos.provider,
      host: scanRepos.host,
      canonical: scanRepos.canonical,
      url: scanRepos.url,
      defaultBranch: scanRepos.defaultBranch,
      branch: scanRepoBranches.name,
    })
    .from(scanRepos)
    .innerJoin(scanRepoBranches, eq(scanRepoBranches.repoId, scanRepos.id))
    .where(eq(scanRepos.tenantId, accountOf.get(account) ?? ""));

describe("an upload app", () => {
  it("is a Repo with provider upload, no host and one hidden Branch named upload", async () => {
    const res = await call("acme", "/repos", { method: "POST", json: { provider: "upload", repo: "Billing API" } });

    expect({ status: res.status, apps: await appsOf("acme") }).toEqual({
      status: 200,
      apps: [
        {
          provider: "upload",
          host: null,
          canonical: "billing api",
          url: "Billing API",
          defaultBranch: "upload",
          branch: "upload",
        },
      ],
    });
  });

  it("has a name unique in its Account, however it is cased, and free for another Account", async () => {
    const first = DataSchema.parse(
      await (await call("acme", "/repos", { method: "POST", json: { provider: "upload", repo: "Ledger" } })).json(),
    ).data.id;
    const again = DataSchema.parse(
      await (await call("acme", "/repos", { method: "POST", json: { provider: "upload", repo: "LEDGER" } })).json(),
    ).data.id;
    const theirs = DataSchema.parse(
      await (await call("other", "/repos", { method: "POST", json: { provider: "upload", repo: "Ledger" } })).json(),
    ).data.id;

    expect({ sameInAccount: again === first, sameAcrossAccounts: theirs === first }).toEqual({
      sameInAccount: true,
      sameAcrossAccounts: false,
    });
  });

  it.each([
    ["a GitHub address", "https://github.com/octocat/Hello-World"],
    ["an empty name", " "],
    ["a name with a slash", "acme/app"],
  ])("refuses %s as an app name", async (_label, repo) => {
    const res = await call("acme", "/repos", { method: "POST", json: { provider: "upload", repo } });

    expect(res.status).toBe(400);
  });
});

describe("the zips of an upload app", () => {
  it("stores an uploaded zip under the Account with its row, lists it, and removes both", async () => {
    const { env, store } = fakeBindings();
    const appId = await newApp("acme", "Store");
    const uploaded = ArchiveSchema.parse(await dataOf(await upload(env, "acme", appId, "app-1.2.zip", ZIP)));
    const listed = ArchivesSchema.parse(await dataOf(await send(env, "acme", `/repos/${appId}/archives`))).archives;
    const key = `accounts/${accountOf.get("acme")}/uploads/${appId}/${uploaded.id}.zip`;
    const storedBefore = store.has(key);

    const removed = await send(env, "acme", `/repos/${appId}/archives/${uploaded.id}`, { method: "DELETE" });
    const rows = await test.raw.select().from(scanUploadArchives).where(eq(scanUploadArchives.repoId, appId));

    expect({
      uploaded: { label: uploaded.label, sizeBytes: uploaded.sizeBytes, contentSha256: uploaded.contentSha256 },
      listed: listed.map((archive) => archive.id),
      storedBefore,
      removed: removed.status,
      storedAfter: store.has(key),
      rows,
    }).toEqual({
      uploaded: { label: "app-1.2.zip", sizeBytes: ZIP.byteLength, contentSha256: ZIP_SHA256 },
      listed: [uploaded.id],
      storedBefore: true,
      removed: 200,
      storedAfter: false,
      rows: [],
    });
  });

  it("refuses a file that is not a zip, and stores nothing", async () => {
    const { env, store } = fakeBindings();
    const appId = await newApp("acme", "Not a zip");

    const res = await upload(env, "acme", appId, "notes.txt", new TextEncoder().encode("just text"));
    const rows = await test.raw.select().from(scanUploadArchives).where(eq(scanUploadArchives.repoId, appId));

    expect({ status: res.status, rows: rows.length, stored: store.size }).toEqual({ status: 400, rows: 0, stored: 0 });
  });

  it("takes no zip for a git Repo", async () => {
    const { env } = fakeBindings();
    const repoId = DataSchema.parse(
      await (
        await call("acme", "/repos", { method: "POST", json: { repo: "https://github.com/octocat/Hello-World" } })
      ).json(),
    ).data.id;

    const res = await upload(env, "acme", z.uuid().parse(repoId), "app.zip", ZIP);

    expect(res.status).toBe(404);
  });

  it("never lets one Account read, add to or remove another Account's zips", async () => {
    const { env, store } = fakeBindings();
    const theirApp = await newApp("other", "Theirs");
    const theirs = ArchiveSchema.parse(await dataOf(await upload(env, "other", theirApp, "theirs.zip", ZIP)));

    const listed = await send(env, "acme", `/repos/${theirApp}/archives`);
    const added = await upload(env, "acme", theirApp, "mine.zip", ZIP);
    const removed = await send(env, "acme", `/repos/${theirApp}/archives/${theirs.id}`, { method: "DELETE" });
    const rows = await test.raw
      .select({ id: scanUploadArchives.id })
      .from(scanUploadArchives)
      .where(eq(scanUploadArchives.repoId, theirApp));

    expect({
      listed: listed.status,
      added: added.status,
      removed: removed.status,
      rows: rows.map((row) => row.id),
      stored: store.size,
    }).toEqual({
      listed: 404,
      added: 404,
      removed: 404,
      rows: [theirs.id],
      stored: 1,
    });
  });
});

describe("removing a git repo", () => {
  it("takes it off the list, keeps the row, refuses a second removal and lists it again when it is added again", async () => {
    const repo = "https://github.com/octocat/soft-delete";
    const repoId = z
      .uuid()
      .parse(DataSchema.parse(await (await call("acme", "/repos", { method: "POST", json: { repo } })).json()).data.id);
    const rowOf = async () =>
      (await test.raw.select({ removedAt: scanRepos.removedAt }).from(scanRepos).where(eq(scanRepos.id, repoId)))[0];
    const listedIds = async () =>
      z
        .object({ data: z.object({ repos: z.array(z.object({ id: z.string() })) }) })
        .parse(await (await call("acme", "/repos")).json())
        .data.repos.map((r) => r.id);

    const removed = await call("acme", `/repos/${repoId}`, { method: "DELETE" });
    const afterRemove = {
      listed: (await listedIds()).includes(repoId),
      removedAt: (await rowOf())?.removedAt !== null,
    };
    const second = await call("acme", `/repos/${repoId}`, { method: "DELETE" });
    await call("acme", "/repos", { method: "POST", json: { repo } });

    expect({
      removed: removed.status,
      afterRemove,
      second: second.status,
      listedAgain: (await listedIds()).includes(repoId),
      removedAtCleared: (await rowOf())?.removedAt,
    }).toEqual({
      removed: 200,
      afterRemove: { listed: false, removedAt: true },
      second: 404,
      listedAgain: true,
      removedAtCleared: null,
    });
  });
});

describe("who may remove a Repo, and when", () => {
  const newGitRepo = async (account: string, name: string) =>
    z
      .uuid()
      .parse(
        DataSchema.parse(
          await (
            await call(account, "/repos", { method: "POST", json: { repo: `https://github.com/octocat/${name}` } })
          ).json(),
        ).data.id,
      );
  const removedAtOf = async (repoId: string) =>
    (await test.raw.select({ removedAt: scanRepos.removedAt }).from(scanRepos).where(eq(scanRepos.id, repoId)))[0]
      ?.removedAt ?? null;

  it("answers 403 to a login without the Power, and removes nothing", async () => {
    held = new Set();
    const repoId = await newGitRepo("acme", "plain-member");

    const res = await call("acme", `/repos/${repoId}`, { method: "DELETE" });

    expect({ status: res.status, removedAt: await removedAtOf(repoId) }).toEqual({ status: 403, removedAt: null });
  });

  it.each(["queued", "running"] as const)(
    "answers 409 while a Scan of the Repo is %s, and removes nothing",
    async (status) => {
      const repoId = await newGitRepo("acme", `busy-${status}`);
      await test.raw
        .insert(scans)
        .values(scanValues(accountOf.get("acme") ?? "", repoId, `busy-${status}`, "2026-11-01T00:00:00Z", { status }));

      const res = await call("acme", `/repos/${repoId}`, { method: "DELETE" });

      expect({ status: res.status, removedAt: await removedAtOf(repoId) }).toEqual({ status: 409, removedAt: null });
    },
  );

  it("removes a Repo whose Scans are all finished, and keeps those Scans", async () => {
    const repoId = await newGitRepo("acme", "finished");
    await test.raw
      .insert(scans)
      .values(scanValues(accountOf.get("acme") ?? "", repoId, "finished-1", "2026-11-01T00:00:00Z"));

    const res = await call("acme", `/repos/${repoId}`, { method: "DELETE" });
    const kept = await test.raw.select({ id: scans.id }).from(scans).where(eq(scans.repoId, repoId));

    expect({ status: res.status, kept: kept.map((row) => row.id) }).toEqual({ status: 200, kept: ["finished-1"] });
  });

  it("writes repo.removed to the Audit trail with the actor, once", async () => {
    const repoId = await newGitRepo("acme", "audited");
    await call("acme", `/repos/${repoId}`, { method: "DELETE" });
    await call("acme", `/repos/${repoId}`, { method: "DELETE" });

    const rows = await test.raw.select().from(accessAuditLog).where(eq(accessAuditLog.subjectId, repoId));

    expect(rows.map((row) => [row.action, row.actorPartyId, row.after])).toEqual([
      ["repo.removed", partyOf.get("acme"), { tenantId: accountOf.get("acme") }],
    ]);
  });

  it("never lets one Account remove another Account's Repo", async () => {
    const repoId = await newGitRepo("other", "theirs");

    const res = await call("acme", `/repos/${repoId}`, { method: "DELETE" });
    const audit = await test.raw.select().from(accessAuditLog).where(eq(accessAuditLog.subjectId, repoId));

    expect({ status: res.status, removedAt: await removedAtOf(repoId), audit: audit.length }).toEqual({
      status: 404,
      removedAt: null,
      audit: 0,
    });
  });

  it("purges every zip of a removed upload app, rows and bytes", async () => {
    const { env, store } = fakeBindings();
    const appId = await newApp("acme", "Purged");
    await upload(env, "acme", appId, "one.zip", ZIP);
    await upload(env, "acme", appId, "two.zip", ZIP);
    const stored = store.size;

    const res = await send(env, "acme", `/repos/${appId}`, { method: "DELETE" });
    const rows = await test.raw
      .select({ id: scanUploadArchives.id })
      .from(scanUploadArchives)
      .where(eq(scanUploadArchives.repoId, appId));

    expect({ stored, status: res.status, rows: rows.length, left: store.size }).toEqual({
      stored: 2,
      status: 200,
      rows: 0,
      left: 0,
    });
  });
});
