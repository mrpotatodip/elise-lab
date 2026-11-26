import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { accessAuditLog, authUser, scanRepos } from "@repo/db-elise/schema";
import { PROJECT_LIMIT_PER_TENANT, PROJECT_NAME_MAX, type AccessPower } from "@repo/contracts/elise";
import { openTestDb, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";

type CallBody = { name: string } | { projectId: string | null } | { provider: "upload"; repo: string };

const USER = "projects-user";
const REPO_B = "https://github.com/octocat/Spoon-Knife";

let test: TestDb;
let tenantId: string;
let otherTenantId: string;
let partyId: string;
let repoA: string;
let repoB: string;
let otherRepo: string;
let held: ReadonlySet<AccessPower> = new Set();
let signedIn: string | undefined = USER;
let auditSeen = 0;

const ADMIN: ReadonlySet<AccessPower> = new Set<AccessPower>([
  "company:dashboard:read",
  "company:summary:read",
  "company:repos:delete",
]);
const MEMBER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:dashboard:read", "company:summary:read"]);

const app = tenantRouteApp(() => test, {
  sessionUserId: async () => signedIn,
  userHasPower: async (_c, _userId, _accountId, power) => held.has(power),
});

const Envelope = z.object({ data: z.unknown(), error: z.unknown() });
const ProjectOut = z.object({ id: z.uuid(), name: z.string() });
const ReposOut = z.object({
  repos: z.array(z.object({ id: z.string(), projectId: z.string().nullable().optional() })),
});

const send = async (path: string, method?: string, body?: CallBody, accountId = tenantId) => {
  const res = await callAs(app, accountId, path, { method, body });
  return { status: res.status, data: Envelope.parse(await res.json()) };
};
const createProject = async (name: string) => ProjectOut.parse((await send("/projects", "POST", { name })).data.data);
const projectIdsOfRepos = async () =>
  Object.fromEntries(ReposOut.parse((await send("/repos")).data.data).repos.map((repo) => [repo.id, repo.projectId]));
const auditRows = async () =>
  (
    await test.raw.select({ action: accessAuditLog.action, actor: accessAuditLog.actorPartyId }).from(accessAuditLog)
  ).slice(auditSeen);
const auditActions = async () => (await auditRows()).map((row) => row.action);

beforeAll(async () => {
  test = await openTestDb();
  const acme = await seedTenant(test, "acme");
  tenantId = acme.tenantId;
  partyId = acme.partyId;
  await test.raw
    .insert(authUser)
    .values({ id: USER, name: "Ada", email: "ada@example.com", emailVerified: true, partyId });
  otherTenantId = (await seedTenant(test, "other")).tenantId;
  repoA = await seedRepo(test, tenantId);
  repoB = await seedRepo(test, tenantId, REPO_B);
  otherRepo = await seedRepo(test, otherTenantId);
});

afterAll(async () => {
  await test.close();
});

beforeEach(async () => {
  held = ADMIN;
  signedIn = USER;
  for (const project of ProjectList(await send("/projects"))) await send(`/projects/${project.id}`, "DELETE");
  auditSeen = (await test.raw.select({ id: accessAuditLog.id }).from(accessAuditLog)).length;
});

const ProjectList = (answer: { data: z.infer<typeof Envelope> }) => z.array(ProjectOut).parse(answer.data.data);

describe("projects", () => {
  it("creates a Project and lists it, with the Repos starting in none", async () => {
    const created = await send("/projects", "POST", { name: "Storefront" });

    expect(created.status).toBe(201);
    expect(ProjectList(await send("/projects")).map((project) => project.name)).toEqual(["Storefront"]);
    expect(await projectIdsOfRepos()).toEqual({ [repoA]: null, [repoB]: null });
  });

  it.each([
    ["the same name in another case", "STOREFRONT"],
    ["the same name with spaces around it", "  Storefront "],
  ])("refuses %s with a 409", async (_label, name) => {
    await createProject("Storefront");
    const again = await send("/projects", "POST", { name });

    expect(again.status).toBe(409);
    expect(again.data).toMatchObject({ data: null, error: { code: "CONFLICT" } });
  });

  it.each([
    ["a blank name", "   "],
    ["a name over the limit", "x".repeat(PROJECT_NAME_MAX + 1)],
  ])("refuses %s with a 400", async (_label, name) => {
    expect((await send("/projects", "POST", { name })).status).toBe(400);
  });

  it("accepts a name of exactly the limit", async () => {
    expect((await send("/projects", "POST", { name: "x".repeat(PROJECT_NAME_MAX) })).status).toBe(201);
  });

  it("refuses the Project past the limit and says why", async () => {
    for (let n = 0; n < PROJECT_LIMIT_PER_TENANT; n++) await createProject(`Project ${n}`);
    const over = await send("/projects", "POST", { name: "One too many" });

    expect(over.status).toBe(409);
    expect(JSON.stringify(over.data.error)).toContain("limit");
  });

  it("lets two Accounts use the same name", async () => {
    await createProject("Storefront");
    expect((await send("/projects", "POST", { name: "Storefront" }, otherTenantId)).status).toBe(201);
    await send(`/projects/${(await createProjectOf(otherTenantId)).id}`, "DELETE", undefined, otherTenantId);
  });

  it("renames a Project, and refuses a rename onto another name", async () => {
    const shop = await createProject("Shop");
    await createProject("Admin");

    const renamed = await send(`/projects/${shop.id}`, "PATCH", { name: "Storefront" });
    const clash = await send(`/projects/${shop.id}`, "PATCH", { name: "admin" });

    expect([renamed.status, clash.status]).toEqual([200, 409]);
    expect(ProjectList(await send("/projects")).map((project) => project.name)).toEqual(["Admin", "Storefront"]);
  });

  it("answers 404 to renaming or deleting a Project that is not there", async () => {
    const missing = "00000000-0000-4000-8000-0000000000aa";

    expect([
      (await send(`/projects/${missing}`, "PATCH", { name: "x" })).status,
      (await send(`/projects/${missing}`, "DELETE")).status,
    ]).toEqual([404, 404]);
  });
});

const createProjectOf = async (accountId: string) =>
  ProjectOut.parse((await send("/projects", "POST", { name: "Other" }, accountId)).data.data);

describe("moving a Repo", () => {
  it("moves a Repo into a Project, between Projects and out again, and the Repos list says so", async () => {
    const web = await createProject("Web");
    const api = await createProject("API");
    const move = (projectId: string | null) => send(`/repos/${repoA}/project`, "PUT", { projectId });

    expect((await move(web.id)).status).toBe(200);
    expect((await projectIdsOfRepos())[repoA]).toBe(web.id);
    await move(api.id);
    expect((await projectIdsOfRepos())[repoA]).toBe(api.id);
    await move(null);
    expect((await projectIdsOfRepos())[repoA]).toBeNull();
  });

  it("leaves the other Repos where they were", async () => {
    const web = await createProject("Web");
    await send(`/repos/${repoA}/project`, "PUT", { projectId: web.id });

    expect((await projectIdsOfRepos())[repoB]).toBeNull();
  });

  it("answers 404 to a Project or a Repo of another Account", async () => {
    const theirs = await createProjectOf(otherTenantId);
    const mine = await createProject("Web");

    expect((await send(`/repos/${repoA}/project`, "PUT", { projectId: theirs.id })).status).toBe(404);
    expect((await send(`/repos/${otherRepo}/project`, "PUT", { projectId: mine.id })).status).toBe(404);
    expect((await projectIdsOfRepos())[repoA]).toBeNull();
    await send(`/projects/${theirs.id}`, "DELETE", undefined, otherTenantId);
  });

  it("answers 404 to a Repo that was removed", async () => {
    const web = await createProject("Web");
    await test.raw.update(scanRepos).set({ removedAt: new Date() }).where(eq(scanRepos.id, repoB));
    const answer = await send(`/repos/${repoB}/project`, "PUT", { projectId: web.id });
    await test.raw.update(scanRepos).set({ removedAt: null }).where(eq(scanRepos.id, repoB));

    expect(answer.status).toBe(404);
  });

  it("takes an Upload app out of its Project when it is removed, and keeps it out when it is added again", async () => {
    const web = await createProject("Web");
    const added = await send("/repos", "POST", { provider: "upload", repo: "Ledger" });
    const appId = z.object({ id: z.string() }).parse(added.data.data).id;
    await send(`/repos/${appId}/project`, "PUT", { projectId: web.id });
    const projectOfApp = async () =>
      (await test.raw.select({ projectId: scanRepos.projectId }).from(scanRepos).where(eq(scanRepos.id, appId)))[0]
        ?.projectId;

    await send(`/repos/${appId}`, "DELETE");
    const afterRemove = await projectOfApp();
    await test.raw.update(scanRepos).set({ projectId: web.id }).where(eq(scanRepos.id, appId));
    await send("/repos", "POST", { provider: "upload", repo: "Ledger" });

    const afterReAdd = await projectOfApp();
    await send(`/repos/${appId}`, "DELETE");

    expect({ afterRemove, afterReAdd }).toEqual({ afterRemove: null, afterReAdd: null });
  });
});

describe("deleting a Project", () => {
  it("leaves its Repos ungrouped and deletes none of them", async () => {
    const web = await createProject("Web");
    await send(`/repos/${repoA}/project`, "PUT", { projectId: web.id });
    await send(`/repos/${repoB}/project`, "PUT", { projectId: web.id });

    const deleted = await send(`/projects/${web.id}`, "DELETE");

    expect(deleted.status).toBe(200);
    expect(await projectIdsOfRepos()).toEqual({ [repoA]: null, [repoB]: null });
    expect(ProjectList(await send("/projects"))).toEqual([]);
  });
});

describe("the audit log", () => {
  it("records create, rename, move and delete with the actor", async () => {
    const web = await createProject("Web");
    await send(`/projects/${web.id}`, "PATCH", { name: "Website" });
    await send(`/repos/${repoA}/project`, "PUT", { projectId: web.id });
    await send(`/projects/${web.id}`, "DELETE");
    const rows = await auditRows();

    expect(rows.map((row) => row.action)).toEqual([
      "project.created",
      "project.renamed",
      "repo.project.moved",
      "project.deleted",
    ]);
    expect(new Set(rows.map((row) => row.actor))).toEqual(new Set([partyId]));
  });

  it("writes no row for a refused change", async () => {
    await createProject("Web");
    await send("/projects", "POST", { name: "web" });

    expect(await auditActions()).toEqual(["project.created"]);
  });
});

describe("who may change Projects", () => {
  const MISSING = "00000000-0000-4000-8000-0000000000aa";
  const WRITES: Array<[string, string, CallBody | undefined]> = [
    ["POST", "/projects", { name: "Web" }],
    ["PATCH", `/projects/${MISSING}`, { name: "Web" }],
    ["DELETE", `/projects/${MISSING}`, undefined],
    ["PUT", `/repos/${MISSING}/project`, { projectId: null }],
  ];

  it.each(WRITES)("%s %s is refused with 403 to a Role without the Repo Power", async (method, path, body) => {
    held = MEMBER;

    expect((await send(path, method, body)).status).toBe(403);
  });

  it("lets that Role read the Projects", async () => {
    held = MEMBER;

    expect((await send("/projects")).status).toBe(200);
  });

  it.each(WRITES)(
    "%s %s is refused with 401 with no session, the service token notwithstanding",
    async (method, path, body) => {
      signedIn = undefined;

      expect((await send(path, method, body)).status).toBe(401);
    },
  );
});
