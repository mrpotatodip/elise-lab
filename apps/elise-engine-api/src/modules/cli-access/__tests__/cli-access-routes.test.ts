import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { authUser } from "@repo/db-elise/schema";
import {
  ApprovedRunnerLoginCheckSchema,
  CliAccessListSchema,
  type CliAccessGrantableScope,
} from "@repo/contracts/elise";
import { fakeBindings, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { cliAccessIdentitySvc } from "#/modules/cli-access";
import { checkRunnerLoginSvc, runnerIdentitySvc, startRunnerLoginSvc } from "#/modules/runners/handlers";

type Role = "admin" | "watcher" | "none";

const USER = "cli-access-user";
const MISSING_SCAN = "0b8c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4";

let test: TestDb;
let tenantId: string;
let otherTenantId: string;
let role: Role = "admin";

const app = tenantRouteApp(() => test, {
  sessionUserId: async (c) => c.req.header("x-test-session"),
  cliAccess: (_c, token) => Effect.runPromise(cliAccessIdentitySvc(test.http, token)),
  runnerIdentity: (_c, token) => Effect.runPromise(runnerIdentitySvc(test.http, token)),
  userHasAccount: async (_c, _userId, accountId) => accountId === tenantId && role !== "none",
  userHasPower: async (_c, _userId, accountId, power) =>
    accountId === tenantId && (role === "admin" || (role === "watcher" && power === "company:summary:read")),
});

const Envelope = z.object({ data: z.unknown(), error: z.unknown() });

type Call = { method?: string; token?: string; session?: boolean; account?: string; body?: unknown };

const call = async (path: string, init: Call = {}) => {
  const headers = new Headers({ "x-account-id": init.account ?? tenantId });
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.session) headers.set("x-test-session", USER);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const res = await app.fetch(
    new Request(`http://localhost${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    fakeBindings().env,
    testExecutionContext,
  );
  return { status: res.status, body: Envelope.parse(await res.json()) };
};

// -----
// A real login on the real queries: start, a signed-in member
// approves with the two choices, and the CLI collects once.
// -----
const login = async (choices: { runScans?: boolean; cliScope: CliAccessGrantableScope | null }) => {
  const started = await Effect.runPromise(
    startRunnerLoginSvc(
      test.http,
      { name: "laptop", os: "macos", cpu: "arm64", version: "0.7.0" },
      { ip: "203.0.113.7", dashboardUrl: "https://app.example.com" },
    ),
  );
  const approval = await call("/runners/login/approve", {
    method: "POST",
    session: true,
    body: { userCode: started.userCode, name: "laptop", ...choices },
  });
  const checked = await Effect.runPromise(
    checkRunnerLoginSvc(test.http, { deviceCode: started.deviceCode }).pipe(
      Effect.orElseSucceed(() => ({ status: "pending" as const })),
    ),
  );
  return { approval, collected: ApprovedRunnerLoginCheckSchema.safeParse(checked) };
};

const tokenFor = async (cliScope: CliAccessGrantableScope) => {
  const { collected } = await login({ runScans: false, cliScope });
  return collected.data?.cliAccess?.token ?? "";
};

beforeAll(async () => {
  test = await openTestDb();
  const acme = await seedTenant(test, "acme");
  tenantId = acme.tenantId;
  otherTenantId = (await seedTenant(test, "other")).tenantId;
  await test.raw
    .insert(authUser)
    .values({ id: USER, name: "Ada", email: "ada@example.com", emailVerified: true, partyId: acme.partyId });
});

afterAll(async () => {
  await test.close();
});

beforeEach(() => {
  role = "admin";
});

describe("CLI access on the routes a CLI may use", () => {
  it("lets a read token list repos and Scans, and refuses it a Scan start", async () => {
    const token = await tokenFor("read");

    expect((await call("/repos", { token })).status).toBe(200);
    expect((await call("/scans", { token })).status).toBe(200);
    expect((await call("/scans", { token, method: "POST", body: { repo: "https://github.com/o/n" } })).status).toBe(
      403,
    );
  });

  it("lets a start token reach the start routes", async () => {
    const token = await tokenFor("start");

    expect((await call(`/scans/${MISSING_SCAN}/stop`, { token, method: "POST" })).status).toBe(404);
  });

  it.each([
    ["GET", "/team"],
    ["GET", "/groups"],
    ["GET", "/runners"],
    ["GET", "/usage/plan"],
    ["GET", "/usage/anthropic-key"],
    ["PUT", "/findings/triage"],
    ["POST", "/runners/login/approve"],
    ["POST", "/runners/claim"],
    ["DELETE", `/cli-access/${MISSING_SCAN}`],
    ["GET", "/cli-access"],
  ])("refuses a start token on %s %s", async (method, path) => {
    const token = await tokenFor("start");

    expect((await call(path, { token, method })).status).toBe(401);
  });

  it("refuses a token on another account", async () => {
    const token = await tokenFor("start");

    expect((await call("/repos", { token, account: otherTenantId })).status).toBe(403);
  });
});

describe("the Role limits every scope", () => {
  it("gives a Watcher read and refuses it start", async () => {
    role = "watcher";

    const start = await login({ runScans: false, cliScope: "start" });
    const read = await login({ runScans: false, cliScope: "read" });

    expect(start.approval.status).toBe(403);
    expect(read.approval.status).toBe(200);
  });

  it("lets a Watcher's read token open only the Summary reads", async () => {
    const token = await tokenFor("read");
    role = "watcher";

    expect((await call("/repos", { token })).status).toBe(200);
    expect((await call("/scans", { token })).status).toBe(403);
  });

  it("refuses a start token once its person lost the Power", async () => {
    const token = await tokenFor("start");
    role = "none";

    expect((await call(`/scans/${MISSING_SCAN}/stop`, { token, method: "POST" })).status).toBe(403);
  });
});

describe("listing and revoking", () => {
  it("lists who approved it, and a revoked token fails on the next call", async () => {
    const { collected } = await login({ runScans: false, cliScope: "read" });
    const token = collected.data?.cliAccess?.token ?? "";
    const id = collected.data?.cliAccess?.id ?? "";

    const listed = CliAccessListSchema.parse((await call("/cli-access", { session: true })).body.data);
    expect(listed.find((item) => item.id === id)).toMatchObject({ scope: "read", approvedByName: "Ada Rossi" });
    expect(JSON.stringify(listed)).not.toContain(token);
    expect((await call("/repos", { token })).status).toBe(200);

    expect((await call(`/cli-access/${id}`, { session: true, method: "DELETE" })).status).toBe(200);

    expect((await call("/repos", { token })).status).toBe(401);
    expect((await call(`/cli-access/${id}`, { session: true, method: "DELETE" })).status).toBe(404);
  });

  it("refuses a revoke from a Role without the Runner delete Power", async () => {
    role = "watcher";

    expect((await call(`/cli-access/${MISSING_SCAN}`, { session: true, method: "DELETE" })).status).toBe(403);
  });
});

describe("the approval", () => {
  it("still connects a Runner and gives no CLI access when an older dashboard sends no choices", async () => {
    const { approval, collected } = await login({ cliScope: null });

    expect(approval.status).toBe(200);
    expect(collected.data).toMatchObject({ runnerId: expect.any(String), token: expect.stringMatching(/^elr_/) });
    expect(collected.data?.cliAccess).toBeUndefined();
  });

  it("gives both credentials in one approval, each token once", async () => {
    const { collected } = await login({ runScans: true, cliScope: "start" });

    expect(collected.data?.token).toMatch(/^elr_/);
    expect(collected.data?.cliAccess).toMatchObject({ scope: "start", token: expect.stringMatching(/^elc_/) });
  });

  it("refuses an approval that chooses nothing", async () => {
    const { approval } = await login({ runScans: false, cliScope: null });

    expect(approval.status).toBe(400);
  });
});
