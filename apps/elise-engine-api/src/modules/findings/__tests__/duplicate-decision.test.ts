import { Effect } from "effect";
import type { FindingTriageBody } from "@repo/contracts/elise";
import { accessAuditLog, authUser } from "@repo/db-elise";
import { scanFindings, scanRepoBranches, scanRepoFindings, scans } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asTenantEffect, branchIdOf, openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { setTriageEffect } from "#/modules/findings/queries";

let test: TestDb;
let tenantId: string;
let repoId: string;
let partyId: string;

const REPO = "https://github.com/octocat/Hello-World";
const NOW = new Date("2026-11-10T00:00:00Z");
const fp = (letter: string) => letter.repeat(64);

const body = (status: FindingTriageBody["status"], letter: string, duplicateOf?: string): FindingTriageBody => ({
  repo: REPO,
  fingerprint: fp(letter),
  status,
  duplicateOf: duplicateOf ? fp(duplicateOf) : undefined,
});

const set = (input: FindingTriageBody) => asTenantEffect(test, tenantId, (db) => setTriageEffect(db, tenantId, repoId, input, "admin", NOW));
const refusal = async (input: FindingTriageBody) => {
  const error = await Effect.runPromise(Effect.flip(set(input)));
  return { tag: error._tag, message: "message" in error ? error.message : "" };
};

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "acme");
  tenantId = seeded.tenantId;
  partyId = seeded.partyId;
  repoId = await seedRepo(test, tenantId, REPO);
  await test.raw.insert(authUser).values({ id: "admin", name: "Ada Rossi", email: "ada@example.com", partyId });
  await test.raw.insert(scans).values(scanValues(tenantId, repoId, "s1", "2026-11-01T00:00:00Z", { status: "succeeded" }));
  const letters = ["a", "b", "c", "d", "e"];
  await test.raw.insert(scanFindings).values(
    letters.map((letter) => ({ tenantId, scanId: "s1", findingId: `F-${letter}`, fingerprint: fp(letter), status: "confirmed" as const, severity: "high" as const, title: letter, class: "authz" })),
  );
  const [dev] = await test.raw.insert(scanRepoBranches).values({ tenantId, repoId, name: "dev" }).returning();
  const main = await branchIdOf(test, repoId);
  const history = (branchId: string, letter: string) => ({ tenantId, repoId, branchId, fingerprint: fp(letter), state: "open" as const, firstSeenScanId: "s1", lastSeenScanId: "s1" });
  await test.raw.insert(scanRepoFindings).values([...["a", "b", "c", "d"].map((letter) => history(main, letter)), history(dev.id, "e")]);
});

afterAll(async () => {
  await test.close();
});

describe("a duplicate decision", () => {
  it("links to a Finding of the same Branch, is audited with the link, and is undone by open", async () => {
    const saved = await Effect.runPromise(set(body("duplicate", "a", "b")));
    const undone = await Effect.runPromise(set(body("open", "a")));
    const audit = await test.raw.select().from(accessAuditLog).orderBy(accessAuditLog.createdAt);

    expect(saved).toMatchObject({ status: "duplicate", duplicateOf: fp("b"), decidedBy: "Ada Rossi" });
    expect(undone).toMatchObject({ status: "open", duplicateOf: null });
    expect(audit[0]).toMatchObject({ actorPartyId: partyId, after: expect.objectContaining({ status: "duplicate", duplicateOf: fp("b") }) });
  });

  it.each([
    ["the Finding itself", body("duplicate", "a", "a"), "itself"],
    ["a Finding of another Branch", body("duplicate", "a", "e"), "same Branch"],
    ["a Finding with no record on the Branch", body("duplicate", "a", "f"), "same Branch"],
  ])("refuses %s", async (_name, input, message) => {
    expect(await refusal(input)).toMatchObject({ tag: "Invalid", message: expect.stringContaining(message) });
  });

  it("refuses a target that is itself a duplicate, and a Finding others point to", async () => {
    await Effect.runPromise(set(body("duplicate", "c", "d")));

    expect(await refusal(body("duplicate", "a", "c"))).toMatchObject({ tag: "Invalid", message: expect.stringContaining("itself a duplicate") });
    expect(await refusal(body("duplicate", "d", "b"))).toMatchObject({ tag: "Invalid", message: expect.stringContaining("point to it") });
  });
});
