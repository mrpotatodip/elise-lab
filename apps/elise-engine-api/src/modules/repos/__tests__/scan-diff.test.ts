import { Effect } from "effect";
import { scanFindings, scanRepoBranches, scanRepoFindings, scans } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { branchIdOf, openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { scanDiffEffect } from "#/modules/repos/queries";

let test: TestDb;
let tenantId: string;
let repoId: string;
let branchId: string;

const fp = (letter: string) => letter.repeat(64);
const titles = (entries: { title: string }[]) => entries.map((entry) => entry.title);
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const fail = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect));

const scan = (id: string, createdAt: string, extra: Partial<typeof scans.$inferInsert> = {}) =>
  scanValues(tenantId, repoId, id, createdAt, { branch: "main", branchId, commitSha: `${id}-sha`, ...extra });

const found = (
  scanId: string,
  letter: string,
  severity: "critical" | "high" | "medium" | "low",
  origin: "new" | "carried" = "new",
) => ({
  tenantId,
  scanId,
  findingId: `${scanId}-${letter}`,
  fingerprint: fp(letter),
  status: "confirmed" as const,
  severity,
  title: `problem ${letter}`,
  class: "authz",
  file: `src/${letter}.ts`,
  origin,
});

const history = (letter: string, extra: Partial<typeof scanRepoFindings.$inferInsert>) => ({
  repoId,
  branchId,
  tenantId,
  fingerprint: fp(letter),
  state: "open" as const,
  firstSeenScanId: "s1",
  lastSeenScanId: "s2",
  ...extra,
});

// -----
// Old lite Scans, the only ones with a diff. s0: e. s1: a, b, d
// (e gone). s2: a re-checked, c new, e back. b was checked and
// gone in s2; d simply vanished from the list.
// -----
beforeAll(async () => {
  test = await openTestDb();
  tenantId = (await seedTenant(test, "acme")).tenantId;
  repoId = await seedRepo(test, tenantId);
  branchId = await branchIdOf(test, repoId);
  await test.raw
    .insert(scans)
    .values([
      scan("s0", "2026-10-31T00:00:00Z"),
      scan("s1", "2026-11-01T00:00:00Z"),
      scan("s2", "2026-11-02T00:00:00Z"),
      scan("full", "2026-11-03T00:00:00Z", { skill: "full" }),
    ]);
  await test.raw
    .insert(scanFindings)
    .values([
      found("s0", "e", "low"),
      found("s1", "a", "high"),
      found("s1", "b", "medium"),
      found("s1", "d", "low"),
      found("s2", "a", "high", "carried"),
      found("s2", "c", "critical"),
      found("s2", "e", "low"),
    ]);
  await test.raw
    .insert(scanRepoFindings)
    .values([
      history("a", {}),
      history("b", { state: "fixed_by_code", lastSeenScanId: "s1", fixedInScanId: "s2" }),
      history("c", { firstSeenScanId: "s2" }),
      history("d", { lastSeenScanId: "s1", unchecked: true }),
      history("e", { state: "regressed", firstSeenScanId: "s0", fixedInScanId: "s1" }),
    ]);
});

afterAll(async () => {
  await test.close();
});

describe("scanDiffEffect", () => {
  it("sorts a scan against the previous one", async () => {
    const diff = await run(scanDiffEffect(test.http, tenantId, "s2"));

    expect(diff.previousScanId).toBe("s1");
    expect(titles(diff.stillOpen)).toEqual(["problem a"]);
    expect(titles(diff.new)).toEqual(["problem c"]);
    expect(titles(diff.regressed)).toEqual(["problem e"]);
    expect(titles(diff.fixed)).toEqual(["problem b"]);
    expect(titles(diff.notRechecked)).toEqual(["problem d"]);
  });

  it("calls everything new in the first scan", async () => {
    const diff = await run(scanDiffEffect(test.http, tenantId, "s0"));

    expect(diff.previousScanId).toBeNull();
    expect(diff.stillOpen).toEqual([]);
    expect(diff.regressed).toEqual([]);
  });

  it("refuses a scan that has no recorded findings, and one that is not there", async () => {
    expect(await fail(scanDiffEffect(test.http, tenantId, "full"))).toMatchObject({ _tag: "Invalid" });
    expect(await fail(scanDiffEffect(test.http, tenantId, "nope"))).toMatchObject({ _tag: "NotFound" });
  });

  it("refuses a scan with no tracked branch, and never takes it as the previous scan of a later one", async () => {
    await test.raw
      .insert(scans)
      .values([
        scan("branch", "2026-11-02T12:00:00Z", { ref: "feature/x", branch: null, branchId: null }),
        scan("s3", "2026-11-04T00:00:00Z"),
      ]);
    await test.raw.insert(scanFindings).values([found("branch", "a", "high"), found("s3", "a", "high")]);

    expect(await fail(scanDiffEffect(test.http, tenantId, "branch"))).toMatchObject({ _tag: "Invalid" });
    expect((await run(scanDiffEffect(test.http, tenantId, "s3"))).previousScanId).toBe("s2");
  });

  it("compares a scan only with the previous scan of its own branch", async () => {
    const [{ id: releaseId }] = await test.raw
      .insert(scanRepoBranches)
      .values({ tenantId, repoId, name: "release" })
      .returning({ id: scanRepoBranches.id });
    await test.raw.insert(scans).values(scan("r1", "2026-11-05T00:00:00Z", { branch: "release", branchId: releaseId }));
    await test.raw.insert(scanFindings).values(found("r1", "x", "medium"));
    await test.raw
      .insert(scanRepoFindings)
      .values({ ...history("x", { firstSeenScanId: "r1", lastSeenScanId: "r1" }), branchId: releaseId });

    const diff = await run(scanDiffEffect(test.http, tenantId, "r1"));

    expect(diff.previousScanId).toBeNull();
    expect(titles(diff.new)).toEqual(["problem x"]);
  });
});
