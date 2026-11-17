import { Effect } from "effect";
import { accessAuditLog } from "@repo/db-elise";
import { scanFindingComments, scanFindings, scanFindingTriage, scans } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { FINDING_THREAD_EVENT_LIMIT, FindingThreadSchema, type FindingTriageStatusValue } from "@repo/contracts/elise";
import { asTenantEffect, openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { setTriageEffect } from "#/modules/findings/queries";

let test: TestDb;
let tenantId: string;
let repoId: string;
let partyId: string;

const REPO = "https://github.com/octocat/Hello-World";
const fp = (letter: string) => letter.repeat(64);
const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 0, minute));

const app = tenantRouteApp(() => test);

const thread = async (letter: string) => {
  const res = await callAs(app, tenantId, `/findings/comments?repo=${REPO}&fingerprint=${fp(letter)}`);
  return z.object({ data: FindingThreadSchema }).parse(await res.json()).data.events;
};

const comment = (letter: string, body: string, minute: number) =>
  test.raw.insert(scanFindingComments).values({ tenantId, repoId, fingerprint: fp(letter), authorPartyId: partyId, body, createdAt: at(minute) });

const triageRow = async (letter: string) => {
  const [row] = await test.raw.insert(scanFindingTriage).values({ tenantId, repoId, fingerprint: fp(letter), status: "fixed" }).returning();
  return row.id;
};

type DecisionAfter = { status: FindingTriageStatusValue; note?: string; acceptedUntil?: string };

const decision = (letter: string, triageId: string, minute: number, after: DecisionAfter, actorPartyId: string | null = partyId) =>
  test.raw.insert(accessAuditLog).values({
    actorPartyId,
    action: after.status === "accepted_risk" ? "finding.risk.accepted" : "finding.triage.set",
    subjectId: triageId,
    after: { tenantId, fingerprint: fp(letter), note: null, acceptedUntil: null, ...after },
    createdAt: at(minute),
  });

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "acme");
  tenantId = seeded.tenantId;
  partyId = seeded.partyId;
  repoId = await seedRepo(test, tenantId, REPO);
  await test.raw.insert(scans).values(scanValues(tenantId, repoId, "s1", "2026-11-01T00:00:00Z", { status: "succeeded" }));
  await test.raw.insert(scanFindings).values(
    ["a", "b", "c", "d", "e"].map((letter) => ({ tenantId, scanId: "s1", findingId: `F-${letter}`, fingerprint: fp(letter), status: "confirmed" as const, severity: "high" as const, title: letter, class: "authz" })),
  );
});

afterAll(async () => {
  await test.close();
});

describe("a thread with decisions", () => {
  it("merges comments and decisions oldest first, naming who decided and when a risk ends", async () => {
    const triageId = await triageRow("a");
    await comment("a", "Looking at it.", 1);
    await decision("a", triageId, 2, { status: "fixed" });
    await comment("a", "Not fixed after all.", 3);
    await decision("a", triageId, 4, { status: "accepted_risk", note: "Behind the VPN", acceptedUntil: at(60).toISOString() });

    const events = await thread("a");

    expect(events.map((event) => (event.kind === "comment" ? [event.kind, event.body] : [event.kind, event.status, event.actorName, event.acceptedUntil]))).toEqual([
      ["comment", "Looking at it."],
      ["decision", "fixed", "Ada Rossi", null],
      ["comment", "Not fixed after all."],
      ["decision", "accepted_risk", "Ada Rossi", at(60).toISOString()],
    ]);
  });

  it("shows a decision made with the service token, or by a removed login, with no name", async () => {
    await Effect.runPromise(asTenantEffect(test, tenantId, (db) => setTriageEffect(db, tenantId, repoId, { repo: REPO, fingerprint: fp("b"), status: "fixed" }, undefined, at(0))));
    await decision("c", await triageRow("c"), 1, { status: "false_positive" }, null);

    const names = async (letter: string) => (await thread(letter)).map((event) => [event.kind, event.kind === "decision" ? event.actorName : "n/a"]);

    expect([await names("b"), await names("c")]).toEqual([[["decision", null]], [["decision", null]]]);
  });

  it("still shows the comments of a Finding that was never triaged", async () => {
    await comment("d", "First thoughts.", 1);

    expect((await thread("d")).map((event) => event.kind)).toEqual(["comment"]);
  });

  it("keeps the latest events in all, whichever kind they are", async () => {
    const triageId = await triageRow("e");
    const half = FINDING_THREAD_EVENT_LIMIT / 2;
    for (let i = 0; i < half + 20; i += 1) await comment("e", `c${i}`, i * 2);
    for (let i = 0; i < half + 20; i += 1) await decision("e", triageId, i * 2 + 1, { status: i % 2 === 0 ? "fixed" : "open" });

    const events = await thread("e");

    expect([events.length, events[0].createdAt, events.at(-1)?.createdAt]).toEqual([FINDING_THREAD_EVENT_LIMIT, at(40).toISOString(), at(2 * (half + 20) - 1).toISOString()]);
  });
});
