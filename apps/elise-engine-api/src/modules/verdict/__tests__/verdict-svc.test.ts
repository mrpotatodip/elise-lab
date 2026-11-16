import { VERDICT_MIN_SCANS, VERDICT_SCAN_WEIGHTS } from "@repo/contracts/elise";
import { Effect } from "effect";
import { scanFindings, scanFindingTriage, scanRepoFindings, scans } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { branchIdOf, openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { verdictSvc } from "#/modules/verdict/handlers";

let test: TestDb;
let tenantId: string;
let repoId: string;
let otherTenantId: string;
let otherRepoId: string;

const NOW = new Date("2026-11-10T00:00:00Z");
const COMMIT = "a".repeat(40);
const ELSEWHERE = "b".repeat(40);
const fp = (letter: string) => letter.repeat(64);

const scan = (id: string, day: number, extra: Partial<typeof scans.$inferInsert> = {}) =>
  scanValues(tenantId, repoId, id, `2026-11-0${day}T00:00:00Z`, { commitSha: COMMIT, priorsGiven: 0, priorsUnchecked: 0, ...extra });

const found = (scanId: string, letter: string, severity: "critical" | "high" | "medium" | "low", tenant = tenantId) => ({
  tenantId: tenant,
  scanId,
  findingId: `${scanId}-${letter}`,
  fingerprint: fp(letter),
  status: "confirmed" as const,
  severity,
  title: `problem ${letter}`,
  class: "authz",
});

const run = (commit = COMMIT, repo = repoId, tenant = tenantId) => Effect.runPromise(verdictSvc(test.http, tenant, repo, commit, NOW));

beforeAll(async () => {
  test = await openTestDb();
  tenantId = (await seedTenant(test, "acme")).tenantId;
  otherTenantId = (await seedTenant(test, "other")).tenantId;
  repoId = await seedRepo(test, tenantId);
  otherRepoId = await seedRepo(test, otherTenantId);
});

afterAll(async () => {
  await test.close();
});

describe("verdictSvc", () => {
  it("cannot tell for a commit with no scan, and for a repo that is not in the account", async () => {
    expect(await run()).toMatchObject({ verdict: "cannot_tell", reasons: [{ code: "not_scanned" }] });
    expect(await Effect.runPromise(Effect.flip(verdictSvc(test.http, tenantId, otherRepoId, COMMIT, NOW)))).toMatchObject({ _tag: "NotFound" });
    expect(await Effect.runPromise(Effect.flip(verdictSvc(test.http, otherTenantId, repoId, COMMIT, NOW)))).toMatchObject({ _tag: "NotFound" });
  });

  it("counts only succeeded scans of this commit that have a weight, and a scan of a ref counts", async () => {
    await test.raw.insert(scans).values([
      scan("good-1", 1),
      scan("on-branch", 2, { ref: "feature/x" }),
      scan("failed", 3, { status: "failed" }),
      scan("full", 4, { skill: "full" }),
      scan("other-commit", 5, { commitSha: ELSEWHERE }),
    ]);
    await test.raw.insert(scanFindings).values([found("other-commit", "z", "critical"), found("failed", "y", "critical")]);

    expect(await run()).toMatchObject({ verdict: "pass", scans: { counted: 2, ids: ["on-branch", "good-1"] }, open: [] });
  });

  it("merges the findings of every scan and reads the decisions of people", async () => {
    await test.raw.insert(scanFindings).values([found("good-1", "a", "high"), found("on-branch", "b", "medium"), found("on-branch", "c", "high")]);
    await test.raw.insert(scanFindingTriage).values([
      { tenantId, repoId, fingerprint: fp("c"), status: "false_positive", note: "test fixture" },
      { tenantId, repoId, fingerprint: fp("a"), status: "accepted_risk", note: "behind the VPN", acceptedUntil: new Date("2026-12-01T00:00:00Z") },
    ]);

    const verdict = await run();

    expect(verdict.verdict).toBe("pass");
    expect(verdict.open.map((item) => item.title)).toEqual(["problem b"]);
    expect(verdict.accepted.map((item) => item.note)).toEqual(["behind the VPN"]);
    expect(verdict.dismissed.map((item) => item.title)).toEqual(["problem c"]);
  });

  it("never reads another account's scans, findings or decisions", async () => {
    await test.raw.insert(scans).values([
      scanValues(otherTenantId, otherRepoId, "theirs-1", "2026-11-01T00:00:00Z", { commitSha: COMMIT }),
      scanValues(otherTenantId, otherRepoId, "theirs-2", "2026-11-02T00:00:00Z", { commitSha: COMMIT }),
    ]);
    await test.raw.insert(scanFindings).values(found("theirs-1", "q", "critical", otherTenantId));

    expect((await run()).open.map((item) => item.title)).toEqual(["problem b"]);
    expect((await run(COMMIT, otherRepoId, otherTenantId)).verdict).toBe("fail");
  });

  it("reads the decisions now, so an accepted risk that ran out blocks again", async () => {
    const later = await Effect.runPromise(verdictSvc(test.http, tenantId, repoId, COMMIT, new Date("2026-12-02T00:00:00Z")));

    expect(later.verdict).toBe("fail");
    expect(later.open.find((item) => item.title === "problem a")?.acceptanceExpiredAt).toBe("2026-12-01T00:00:00.000Z");
  });
});

// -----
// Scans count by weight. A checked scan weighs the profile it
// met, an unmet one 0; a scan with no profile_met (an old row,
// a cloud scan) weighs the profile it asked for, an old lite
// scan 1. Every case has a commit of its own.
//
// "lesser" asked for deep and met quick. With every weight at 1
// today, it adds the same as a met scan; the expected numbers
// below come from VERDICT_SCAN_WEIGHTS, so they follow it if a
// weight changes.
// -----
type Kind = "quick" | "standard" | "deep" | "lite" | "old-full" | "partial" | "lesser" | "unmet";

const kindValues = (kind: Kind): Partial<typeof scans.$inferInsert> => {
  if (kind === "lite") return { skill: "lite", profile: "quick", partial: null };
  if (kind === "old-full") return { skill: "full", profile: "deep", partial: null };
  if (kind === "partial") return { skill: "full", profile: "deep", partial: true };
  if (kind === "lesser") return { skill: "full", profile: "deep", partial: false, profileMet: "quick" };
  if (kind === "unmet") return { skill: "full", profile: "deep", partial: false, profileMet: "none" };
  return { skill: "full", profile: kind, partial: false };
};

const seedCase = async (commit: string, kinds: Kind[]) => {
  await test.raw.insert(scans).values(kinds.map((kind, index) => scan(`${commit.slice(0, 4)}-${index}`, index + 1, { commitSha: commit, ...kindValues(kind) })));
};

describe("verdictSvc: scan weights", () => {
  it.each<{ name: string; digit: string; kinds: Kind[]; verdict: "pass" | "cannot_tell"; counted: number }>([
    { name: "one quick scan is enough", digit: "1", kinds: ["quick"], verdict: "pass", counted: 1 },
    { name: "two quick scans add up", digit: "2", kinds: ["quick", "quick"], verdict: "pass", counted: 2 },
    { name: "one standard scan is enough", digit: "3", kinds: ["standard"], verdict: "pass", counted: 1 },
    { name: "one deep scan is enough", digit: "4", kinds: ["deep"], verdict: "pass", counted: 1 },
    { name: "a quick and a standard scan together count", digit: "5", kinds: ["quick", "standard"], verdict: "pass", counted: 2 },
    { name: "one old lite scan is still a verdict", digit: "6", kinds: ["lite"], verdict: "pass", counted: 1 },
    { name: "an old full scan weighs nothing, its findings were never recorded", digit: "7", kinds: ["old-full"], verdict: "cannot_tell", counted: 0 },
    { name: "a partial scan alone cannot tell", digit: "8", kinds: ["partial"], verdict: "cannot_tell", counted: 0 },
  ])("$name", async ({ digit, kinds, verdict, counted }) => {
    const commit = digit.repeat(40);
    await seedCase(commit, kinds);

    expect(await run(commit)).toMatchObject({ verdict, scans: { required: 1, counted } });
  });

  it.each<{ name: string; digit: string; kinds: Kind[]; counted: number }>([
    { name: "a lesser scan weighs the profile it met", digit: "d", kinds: ["lesser"], counted: VERDICT_SCAN_WEIGHTS.quick },
    { name: "a lesser scan next to a met one adds up as the weights say", digit: "e", kinds: ["lesser", "deep"], counted: VERDICT_SCAN_WEIGHTS.quick + VERDICT_SCAN_WEIGHTS.deep },
    { name: "an unmet scan next to a met one adds nothing", digit: "f", kinds: ["unmet", "standard"], counted: VERDICT_SCAN_WEIGHTS.standard },
  ])("$name", async ({ digit, kinds, counted }) => {
    const commit = digit.repeat(40);
    await seedCase(commit, kinds);

    expect(await run(commit)).toMatchObject({ verdict: counted >= VERDICT_MIN_SCANS ? "pass" : "cannot_tell", scans: { required: VERDICT_MIN_SCANS, counted } });
  });

  it("reads an unmet scan alone: cannot tell for want of weight, the scan is listed and its findings are open", async () => {
    const commit = "0".repeat(40);
    await seedCase(commit, ["unmet"]);
    await test.raw.insert(scanFindings).values({ ...found("0000-0", "g", "high"), class: "full-audit" });

    expect(await run(commit)).toMatchObject({
      verdict: "cannot_tell",
      reasons: [{ code: "too_few_scans" }, { code: "over_limit" }],
      scans: { counted: 0, ids: ["0000-0"] },
      counts: { high: 1 },
      open: [{ title: "problem g" }],
    });
  });

  it("lets a newer good scan clear an older partial one that left a problem unchecked", async () => {
    const commit = "9".repeat(40);
    await test.raw.insert(scans).values([
      scan("9999-old", 1, { commitSha: commit, ...kindValues("partial"), priorsUnchecked: 3 }),
      scan("9999-new", 2, { commitSha: commit, ...kindValues("standard") }),
    ]);

    expect(await run(commit)).toMatchObject({ verdict: "pass", reasons: [], scans: { counted: 1 } });
  });

  it("still blocks on an older partial scan while a newer scan weighs nothing", async () => {
    const commit = "a1".repeat(20);
    await test.raw.insert(scans).values([
      scan("a1a1-old", 1, { commitSha: commit, ...kindValues("partial"), priorsUnchecked: 3 }),
      scan("a1a1-new", 2, { commitSha: commit, ...kindValues("old-full") }),
    ]);

    expect(await run(commit)).toMatchObject({ verdict: "cannot_tell", reasons: [{ code: "too_few_scans" }], scans: { counted: 0 } });
  });

  it("counts the findings of a profile scan, and of a partial one that adds no weight", async () => {
    const commit = "b1".repeat(20);
    await seedCase(commit, ["partial", "standard"]);
    await test.raw.insert(scanFindings).values([
      { ...found("b1b1-0", "d", "critical"), class: "full-audit" },
      { ...found("b1b1-1", "e", "medium"), class: "full-audit" },
      { tenantId, scanId: "b1b1-1", findingId: "b1b1-1-f", fingerprint: fp("f"), status: "needs_validation" as const, severity: null, title: "problem f", class: "full-audit" },
    ]);

    expect(await run(commit)).toMatchObject({ verdict: "fail", counts: { critical: 1, medium: 1, needsValidation: 1 }, scans: { ids: ["b1b1-1", "b1b1-0"] } });
  });

  it("does not read the frozen History: an open problem there changes nothing", async () => {
    const commit = "c1".repeat(20);
    await seedCase(commit, ["standard"]);
    await test.raw.insert(scans).values(scan("history-scan", 1, { commitSha: ELSEWHERE }));
    await test.raw.insert(scanFindings).values(found("history-scan", "h", "critical"));
    await test.raw.insert(scanRepoFindings).values({ repoId, tenantId, branchId: await branchIdOf(test, repoId), fingerprint: fp("h"), state: "open", firstSeenScanId: "history-scan", lastSeenScanId: "history-scan" });

    expect(await run(commit)).toMatchObject({ verdict: "pass", open: [], counts: { critical: 0 } });
  });
});
