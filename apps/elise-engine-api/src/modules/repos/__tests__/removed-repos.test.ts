import { and, eq } from "drizzle-orm";
import { authUser } from "@repo/db-elise";
import {
  accessAuditLog,
  platformMasterPlans,
  scanFindings,
  scanRepos,
  scanSignals,
  scans,
  tenantSubscriptions,
} from "@repo/db-elise/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { REPO_LIMIT_PER_TENANT, type AccessPower } from "@repo/contracts/elise";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { branchIdOf, openTestDb, scanValues, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";

let test: TestDb;
let held: ReadonlySet<AccessPower>;
const REMOVER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:repos:delete"]);
const RUNNER = "5b3f0d7e-61a4-4c2f-9d58-2f7a1c9e4b10";
const app = tenantRouteApp(() => test, {
  sessionUserId: async () => "ada",
  userHasAccount: async () => true,
  userHasPower: async (_c, _userId, _accountId, power) => held.has(power),
});
const accountOf = new Map<string, string>();
const partyOf = new Map<string, string>();

const newAccount = async (name: string) => {
  const seeded = await seedTenant(test, name);
  const [pro] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "pro"));
  await test.raw
    .insert(tenantSubscriptions)
    .values({ tenantId: seeded.tenantId, planId: pro.id, status: "active", source: "grant" });
  accountOf.set(name, seeded.tenantId);
  partyOf.set(name, seeded.partyId);
};

beforeAll(async () => {
  test = await openTestDb();
  await newAccount("acme");
  await newAccount("other");
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

const call = (account: string, path: string, init: { method?: string; json?: unknown } = {}) => {
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

const IdSchema = z.object({ data: z.object({ id: z.uuid() }) });
const ReposSchema = z.object({
  data: z.object({
    repos: z.array(z.object({ id: z.string(), removedAt: z.string().nullable().optional(), scans: z.number() })),
  }),
});
const FindingsSchema = z.object({ data: z.object({ findings: z.array(z.object({ findingId: z.string() })) }) });
const SignalsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });
const ErrorSchema = z.object({ error: z.object({ message: z.string() }) });
const fp = (letter: string) => letter.repeat(64);
const addressOf = (name: string) => `https://github.com/octocat/${name}`;

const newRepo = async (account: string, name: string) =>
  IdSchema.parse(
    await (
      await call(account, "/repos", { method: "POST", json: { repo: addressOf(name), branches: ["main"] } })
    ).json(),
  ).data.id;

const seedScan = async (account: string, repoId: string, scanId: string, findingId?: string) => {
  const tenantId = accountOf.get(account) ?? "";
  await test.raw.insert(scans).values(
    scanValues(tenantId, repoId, scanId, "2026-11-01T00:00:00Z", {
      repo: addressOf(scanId),
      branchId: await branchIdOf(test, repoId),
      commitSha: "c".repeat(40),
      skill: "full",
      profile: "standard",
      partial: false,
    }),
  );
  if (findingId)
    await test.raw.insert(scanFindings).values({
      tenantId,
      scanId,
      findingId,
      fingerprint: fp("a"),
      status: "confirmed",
      severity: "high",
      title: findingId,
      class: "authz",
    });
};

const removedRepo = async (account: string, name: string, withScan = true) => {
  const repoId = await newRepo(account, name);
  if (withScan) await seedScan(account, repoId, name, `F-${name}`);
  expect((await call(account, `/repos/${repoId}`, { method: "DELETE" })).status).toBe(200);
  return repoId;
};

const listedIds = async (account: string, search = "") =>
  ReposSchema.parse(await (await call(account, `/repos${search}`)).json()).data.repos.map((repo) => repo.id);
const findingIds = async (account: string) =>
  FindingsSchema.parse(await (await call(account, "/findings")).json()).data.findings.map(
    (finding) => finding.findingId,
  );

const fillRepos = async (account: string, count: number) => {
  await test.raw.insert(scanRepos).values(
    Array.from({ length: count }, (_, k) => ({
      tenantId: accountOf.get(account) ?? "",
      canonical: `octo/fill-${k}`,
      url: addressOf(`fill-${k}`),
    })),
  );
};

describe("a Removed Repo is hidden from", () => {
  it("the findings across Repos, while a live Repo's stay", async () => {
    const live = await newRepo("acme", "hide-live");
    await seedScan("acme", live, "hide-live", "F-hide-live");
    await removedRepo("acme", "hide-gone");

    expect(await findingIds("acme")).toEqual(["F-hide-live"]);
  });

  it("the Repo list, which carries the overview counts", async () => {
    const gone = await removedRepo("acme", "hide-list");

    expect(await listedIds("acme")).not.toContain(gone);
  });

  it("the Verdict, which answers 404", async () => {
    const gone = await removedRepo("acme", "hide-verdict");

    const res = await call("acme", `/repos/${gone}/verdict?commit=${"c".repeat(40)}`);

    expect(res.status).toBe(404);
  });

  it("the Signals", async () => {
    const gone = await removedRepo("acme", "hide-signals");
    await test.raw.insert(scanSignals).values({
      tenantId: accountOf.get("acme") ?? "",
      repoId: gone,
      fingerprint: fp("a"),
      relatedFingerprint: fp("b"),
      kind: "possible_duplicate",
      probability: 0.9,
      modelVersion: "jev-1.14.0",
    });

    const res = await call("acme", `/findings/signals?repo=${addressOf("hide-signals")}`);

    expect(SignalsSchema.parse(await res.json()).data).toEqual([]);
  });
});

describe("a Removed Repo still answers", () => {
  it("a read by ID, with its Scans as its History", async () => {
    const gone = await removedRepo("acme", "direct-read");

    const res = await call("acme", `/repos/${gone}`);

    expect({
      status: res.status,
      scans: z
        .object({ data: z.object({ history: z.array(z.object({ scanId: z.string() })) }) })
        .parse(await res.json())
        .data.history.map((scan) => scan.scanId),
    }).toEqual({
      status: 200,
      scans: ["direct-read"],
    });
  });

  it("a read of one of its Scans", async () => {
    await removedRepo("acme", "direct-scan");

    const res = await call("acme", "/scans/direct-scan");

    expect(res.status).toBe(200);
  });
});

describe("GET /repos?removed=true", () => {
  it("lists the Removed Repos only, each with when it was removed", async () => {
    const live = await newRepo("acme", "removed-list-live");
    const gone = await removedRepo("acme", "removed-list-gone");

    const repos = ReposSchema.parse(await (await call("acme", "/repos?removed=true")).json()).data.repos;

    expect({
      hasLive: repos.some((repo) => repo.id === live),
      gone: repos.filter((repo) => repo.id === gone).map((repo) => [repo.scans, Boolean(repo.removedAt)]),
    }).toEqual({
      hasLive: false,
      gone: [[1, true]],
    });
  });

  it("answers 403 to a login without the Power", async () => {
    held = new Set();

    const res = await call("acme", "/repos?removed=true");

    expect(res.status).toBe(403);
  });

  it("lists nothing of another Account", async () => {
    const theirs = await removedRepo("other", "removed-theirs");

    expect(await listedIds("acme", "?removed=true")).not.toContain(theirs);
  });

  it("still lists the live Repos for a login without the Power", async () => {
    held = new Set();
    const live = await newRepo("acme", "plain-list");

    expect(await listedIds("acme")).toContain(live);
  });
});

const restoredAtOf = async (repoId: string) =>
  (await test.raw.select({ removedAt: scanRepos.removedAt }).from(scanRepos).where(eq(scanRepos.id, repoId)))[0]
    ?.removedAt ?? null;

describe("POST /repos/:repoId/restore", () => {
  it("brings a Removed Repo back to the list and the findings, with its History", async () => {
    const gone = await removedRepo("acme", "restore-back");

    const res = await call("acme", `/repos/${gone}/restore`, { method: "POST" });
    const repo = ReposSchema.parse(await (await call("acme", "/repos")).json()).data.repos.find(
      (item) => item.id === gone,
    );

    expect({
      status: res.status,
      scans: repo?.scans,
      findings: (await findingIds("acme")).includes("F-restore-back"),
    }).toEqual({ status: 200, scans: 1, findings: true });
  });

  it("writes repo.restored to the Audit trail with the actor", async () => {
    const gone = await removedRepo("acme", "restore-audit", false);
    await call("acme", `/repos/${gone}/restore`, { method: "POST" });

    const rows = await test.raw
      .select()
      .from(accessAuditLog)
      .where(and(eq(accessAuditLog.subjectId, gone), eq(accessAuditLog.action, "repo.restored")));

    expect(rows.map((row) => row.actorPartyId)).toEqual([partyOf.get("acme")]);
  });

  it("answers 404 for a Repo that is not removed, and writes no entry", async () => {
    const live = await newRepo("acme", "restore-live");

    const res = await call("acme", `/repos/${live}/restore`, { method: "POST" });
    const rows = await test.raw.select().from(accessAuditLog).where(eq(accessAuditLog.subjectId, live));

    expect({ status: res.status, entries: rows.length }).toEqual({ status: 404, entries: 0 });
  });

  it("answers 403 to a login without the Power, and restores nothing", async () => {
    const gone = await removedRepo("acme", "restore-plain", false);
    held = new Set();

    const res = await call("acme", `/repos/${gone}/restore`, { method: "POST" });

    expect({ status: res.status, stillRemoved: (await restoredAtOf(gone)) !== null }).toEqual({
      status: 403,
      stillRemoved: true,
    });
  });

  it("never restores another Account's Repo", async () => {
    const theirs = await removedRepo("other", "restore-theirs", false);

    const res = await call("acme", `/repos/${theirs}/restore`, { method: "POST" });

    expect({ status: res.status, stillRemoved: (await restoredAtOf(theirs)) !== null }).toEqual({
      status: 404,
      stillRemoved: true,
    });
  });
});

describe("when the Account already has the most Repos", () => {
  const FULL_MESSAGE = `An account can have at most ${REPO_LIMIT_PER_TENANT} repos`;
  const fullAccountWithRemoved = async (name: string) => {
    await newAccount(name);
    const gone = await removedRepo(name, `${name}-gone`, false);
    await fillRepos(name, REPO_LIMIT_PER_TENANT);
    return gone;
  };
  const refusal = async (res: Response) => ({
    status: res.status,
    message: ErrorSchema.parse(await res.json()).error.message,
  });

  it("refuses to restore with the usual 409, and leaves the Repo removed", async () => {
    const gone = await fullAccountWithRemoved("full-restore");

    const res = await call("full-restore", `/repos/${gone}/restore`, { method: "POST" });

    expect({ ...(await refusal(res)), stillRemoved: (await restoredAtOf(gone)) !== null }).toEqual({
      status: 409,
      message: FULL_MESSAGE,
      stillRemoved: true,
    });
  });

  it("refuses to add the Repo again with the usual 409, and leaves it removed", async () => {
    const gone = await fullAccountWithRemoved("full-add");

    const res = await call("full-add", "/repos", { method: "POST", json: { repo: addressOf("full-add-gone") } });

    expect({ ...(await refusal(res)), stillRemoved: (await restoredAtOf(gone)) !== null }).toEqual({
      status: 409,
      message: FULL_MESSAGE,
      stillRemoved: true,
    });
  });

  it("refuses a Scan of its address with the usual 409, leaves it removed and starts no Scan", async () => {
    const gone = await fullAccountWithRemoved("full-scan");

    const res = await call("full-scan", "/scans", {
      method: "POST",
      json: { repo: addressOf("full-scan-gone"), runner_id: RUNNER },
    });
    const started = await test.raw.select({ id: scans.id }).from(scans).where(eq(scans.repoId, gone));

    expect({
      ...(await refusal(res)),
      stillRemoved: (await restoredAtOf(gone)) !== null,
      started: started.length,
    }).toEqual({ status: 409, message: FULL_MESSAGE, stillRemoved: true, started: 0 });
  });

  it("restores once a place is free, by any of the three ways", async () => {
    const gone = await fullAccountWithRemoved("full-free");
    await test.raw
      .delete(scanRepos)
      .where(and(eq(scanRepos.tenantId, accountOf.get("full-free") ?? ""), eq(scanRepos.canonical, "octo/fill-0")));

    const res = await call("full-free", `/repos/${gone}/restore`, { method: "POST" });

    expect({ status: res.status, removed: (await restoredAtOf(gone)) !== null }).toEqual({
      status: 200,
      removed: false,
    });
  });
});

const seedActive = async (account: string, repoId: string, scanId: string, updatedAt: string) => {
  await test.raw.insert(scans).values(
    scanValues(accountOf.get(account) ?? "", repoId, scanId, updatedAt, {
      repo: addressOf(scanId),
      status: "running",
      skill: "full",
      updatedAt: new Date(updatedAt),
    }),
  );
};

describe("DELETE /repos/:repoId with a Scan of the Repo", () => {
  it("answers 409 while a Scan is live, and leaves the Repo listed", async () => {
    const repoId = await newRepo("acme", "remove-live");
    await seedActive("acme", repoId, "remove-live", new Date().toISOString());

    const res = await call("acme", `/repos/${repoId}`, { method: "DELETE" });

    expect({ status: res.status, listed: (await listedIds("acme")).includes(repoId) }).toEqual({
      status: 409,
      listed: true,
    });
  });

  it("is not blocked by a stalled Scan", async () => {
    const repoId = await newRepo("acme", "remove-stalled");
    await seedActive("acme", repoId, "remove-stalled", "2026-11-01T00:00:00Z");

    const res = await call("acme", `/repos/${repoId}`, { method: "DELETE" });

    expect({ status: res.status, listed: (await listedIds("acme")).includes(repoId) }).toEqual({
      status: 200,
      listed: false,
    });
  });

  it("answers 404 for a Repo that is already removed", async () => {
    const gone = await removedRepo("acme", "remove-twice", false);

    const res = await call("acme", `/repos/${gone}`, { method: "DELETE" });

    expect(res.status).toBe(404);
  });
});

describe("a Scan of a Removed Repo started by a login", () => {
  it("writes repo.restored to the Audit trail with that login", async () => {
    const gone = await removedRepo("acme", "scan-audit", false);
    held = new Set<AccessPower>(["company:dashboard:read"]);
    const { env } = fakeBindings();
    const headers = { "x-account-id": accountOf.get("acme") ?? "", "content-type": "application/json" };
    const body = JSON.stringify({ repo: addressOf("scan-audit"), runner_id: RUNNER });

    const res = await app.fetch(
      new Request("http://localhost/scans", { method: "POST", headers, body }),
      env,
      testExecutionContext,
    );
    const rows = await test.raw
      .select()
      .from(accessAuditLog)
      .where(and(eq(accessAuditLog.subjectId, gone), eq(accessAuditLog.action, "repo.restored")));

    expect({ status: res.status, actors: rows.map((row) => row.actorPartyId) }).toEqual({
      status: 201,
      actors: [partyOf.get("acme")],
    });
  });
});

describe("re-adding and scanning bring a Removed Repo back", () => {
  it("adding it again lists it with its History", async () => {
    const gone = await removedRepo("acme", "readd");

    await call("acme", "/repos", { method: "POST", json: { repo: addressOf("readd") } });
    const repo = ReposSchema.parse(await (await call("acme", "/repos")).json()).data.repos.find(
      (item) => item.id === gone,
    );

    expect(repo?.scans).toBe(1);
  });

  it("a Scan of its address lists it again, as the same Repo", async () => {
    const gone = await removedRepo("acme", "rescan");

    const res = await call("acme", "/scans", {
      method: "POST",
      json: { repo: addressOf("rescan"), runner_id: RUNNER },
    });

    expect({ status: res.status, listed: (await listedIds("acme")).includes(gone) }).toEqual({
      status: 201,
      listed: true,
    });
  });
});
