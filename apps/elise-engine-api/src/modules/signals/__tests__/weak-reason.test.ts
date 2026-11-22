import { authUser } from "@repo/db-elise";
import { accessAuditLog, scanFindings, scanSignals, scans, tenants } from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AcceptedRiskCheckSchema, type AccessPower, type CheckAcceptedRiskBody, type FindingTriageBody } from "@repo/contracts/elise";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { fakeTypeSafe } from "#/__tests__/fake-typesafe";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";
import type { TypeSafeGateway } from "#/modules/typesafe";

let test: TestDb;
let tenantId: string;
let repoId: string;
let held: ReadonlySet<AccessPower>;
let fake = fakeTypeSafe();
let gateway: TypeSafeGateway | null = fake.gateway;

const REPO = "https://github.com/octocat/Hello-World";
const FP = "a".repeat(64);
const ACCEPTER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:dashboard:read", "company:findings:accepted_risk:update"]);
const MEMBER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:dashboard:read"]);

const app = tenantRouteApp(() => test, {
  sessionUserId: async () => "ada",
  userHasPower: async (_c, _userId, _accountId, power) => held.has(power),
  typesafe: () => gateway,
});

const call = (path: string, body: CheckAcceptedRiskBody | FindingTriageBody, method: "POST" | "PUT" = "POST") => {
  const { env } = fakeBindings();
  const headers = new Headers({ authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": tenantId, "content-type": "application/json" });
  return app.fetch(new Request(`http://localhost${path}`, { method, headers, body: JSON.stringify(body) }), env, testExecutionContext);
};

const check = (note = "Behind the VPN until the rewrite") => call("/findings/signals/weak-reason", { repo: REPO, fingerprint: FP, note });
const signalOf = async (res: Response) => z.object({ data: AcceptedRiskCheckSchema }).parse(await res.json()).data.signal;

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "acme");
  tenantId = seeded.tenantId;
  repoId = await seedRepo(test, tenantId, REPO);
  await test.raw.insert(authUser).values({ id: "ada", name: "Ada Rossi", email: "ada@example.com", partyId: seeded.partyId });
  await test.raw.insert(scans).values(scanValues(tenantId, repoId, "s1", "2026-11-01T00:00:00Z", { status: "succeeded" }));
  await test.raw.insert(scanFindings).values({
    tenantId,
    scanId: "s1",
    findingId: "F-1",
    fingerprint: FP,
    status: "confirmed",
    severity: "high",
    title: "Missing authz on export",
    class: "authz",
    impact: "Any member can export all rows",
    evidence: "GET /export has no role check",
  });
});

afterAll(async () => {
  await test.close();
});

beforeEach(async () => {
  held = ACCEPTER;
  fake = fakeTypeSafe(0.1);
  gateway = fake.gateway;
  await test.raw.delete(scanSignals);
  await test.raw.update(tenants).set({ signalsEnabled: true });
});

describe("the weak-reason check", () => {
  it("returns a stored Signal for a reason the model finds weak, and sends the Finding text and the note", async () => {
    const signal = await signalOf(await check("we will fix it later"));

    expect(signal).toMatchObject({ kind: "weak_reason", fingerprint: FP, relatedFingerprint: null, probability: 0.1, modelVersion: "jev-fake" });
    expect(await test.raw.select().from(scanSignals).where(eq(scanSignals.id, signal?.id ?? ""))).toHaveLength(1);
    expect(JSON.stringify(fake.calls[0]?.state)).toContain("Missing authz on export");
    expect(JSON.stringify(fake.calls[0]?.state)).toContain("we will fix it later");
  });

  it.each([
    ["a good reason", 0.9],
    ["a doubtful band", 0.5],
  ])("returns none for %s", async (_name, probability) => {
    fake = fakeTypeSafe(probability);
    gateway = fake.gateway;

    expect([await signalOf(await check()), await test.raw.select().from(scanSignals)]).toEqual([null, []]);
  });

  it("asks nothing while Signals are off", async () => {
    await test.raw.update(tenants).set({ signalsEnabled: false });

    expect([await signalOf(await check()), fake.calls.length]).toEqual([null, 0]);
  });

  it("returns none when TypeSafe is not configured or fails", async () => {
    gateway = null;
    const unconfigured = await signalOf(await check());
    gateway = {
      noul: async () => {
        throw new Error("TypeSafe answered 500");
      },
    };

    expect([unconfigured, await signalOf(await check())]).toEqual([null, null]);
  });

  it("refuses a login without the accepted-risk Power", async () => {
    held = MEMBER;

    expect((await check()).status).toBe(403);
  });

  it("answers 404 for a Finding the account does not have", async () => {
    const res = await call("/findings/signals/weak-reason", { repo: REPO, fingerprint: "b".repeat(64), note: "x" });

    expect(res.status).toBe(404);
  });
});

describe("saving an accepted risk over a warning", () => {
  const save = (signalId?: string) => call("/findings/triage", { repo: REPO, fingerprint: FP, status: "accepted_risk", note: "we will fix it later", acceptDays: 30, signalId }, "PUT");
  const auditAfter = async () => (await test.raw.select().from(accessAuditLog).where(eq(accessAuditLog.action, "finding.risk.accepted"))).at(-1)?.after;

  it("records the Signal in the Audit trail", async () => {
    const signal = await signalOf(await check("we will fix it later"));
    const res = await save(signal?.id);

    expect([res.status, await auditAfter()]).toMatchObject([200, { status: "accepted_risk", signalId: signal?.id }]);
  });

  it("saves with no Signal and records none", async () => {
    const res = await save();

    expect(res.status).toBe(200);
    expect(await auditAfter()).not.toHaveProperty("signalId");
  });

  it("refuses a Signal that is not a weak reason of this Finding", async () => {
    const [other] = await test.raw
      .insert(scanSignals)
      .values({ tenantId, repoId, fingerprint: "c".repeat(64), kind: "weak_reason", probability: 0.1, modelVersion: "jev-fake" })
      .returning();

    expect((await save(other.id)).status).toBe(400);
  });
});
