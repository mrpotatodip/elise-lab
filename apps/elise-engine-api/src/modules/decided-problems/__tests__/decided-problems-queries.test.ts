import { Effect } from "effect";
import { scanFindings, scanFindingTriage, scanRepoBranches, scans } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { branchIdOf, openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { OPEN_PROBLEM_CHECKS_FILE } from "#/constants";
import { DECIDED_PROBLEMS_FILE, OPEN_PROBLEMS_FILE } from "#/modules/decided-problems/constants";
import { handoverFilesSvc } from "#/modules/decided-problems/handlers";
import { decidedBranchIdEffect, decidedProblemsEffect, openProblemsEffect } from "#/modules/decided-problems/queries";
import { buildPhasePrompt, CONTAINER_PLACE } from "#/modules/scan-sandbox/utils";

let test: TestDb;
let tenantId: string;
let repoId: string;
let main: string;
let release: string;

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

type Seed = {
  fp: string;
  severity?: "critical" | "high" | "medium" | "low";
  decision?: "false_positive" | "accepted_risk" | "duplicate" | "fixed" | "open" | null;
  scan?: string;
};

const seedProblems = async (rows: Seed[]) => {
  await test.raw.insert(scanFindings).values(
    rows.map((row) => ({
      tenantId,
      scanId: row.scan ?? "s-main",
      findingId: `F-${row.fp}`,
      fingerprint: row.fp,
      status: "confirmed" as const,
      severity: row.severity ?? "high",
      title: `title ${row.fp}`,
      class: "authz",
      file: `src/${row.fp}.ts`,
    })),
  );
  const decided = rows.filter((row) => row.decision);
  if (decided.length === 0) return;
  await test.raw.insert(scanFindingTriage).values(
    decided.map((row) => ({
      tenantId,
      repoId,
      fingerprint: row.fp,
      status: row.decision ?? "open",
      note: "a private note",
      acceptedUntil: row.decision === "accepted_risk" ? new Date("2027-01-01") : null,
      duplicateOf: row.decision === "duplicate" ? "other" : null,
    })),
  );
};

beforeAll(async () => {
  test = await openTestDb();
  ({ tenantId } = await seedTenant(test));
  repoId = await seedRepo(test, tenantId);
  main = await branchIdOf(test, repoId);
  const [row] = await test.raw
    .insert(scanRepoBranches)
    .values({ tenantId, repoId, name: "release" })
    .returning({ id: scanRepoBranches.id });
  release = row.id;
  await test.raw.insert(scans).values([
    scanValues(tenantId, repoId, "s-main", "2026-11-01T10:00:00Z", { skill: "full", branchId: main }),
    scanValues(tenantId, repoId, "s-main-new", "2026-11-02T10:00:00Z", { skill: "full", branchId: main }),
    scanValues(tenantId, repoId, "s-release", "2026-11-01T11:00:00Z", { skill: "full", branchId: release }),
    scanValues(tenantId, repoId, "s-failed", "2026-11-03T10:00:00Z", {
      skill: "full",
      branchId: main,
      status: "failed",
    }),
  ]);
});

afterAll(async () => {
  await test.close();
});

describe("the decided problems of a Branch", () => {
  it("lists a false positive, an accepted risk and a duplicate, worst first, with no note", async () => {
    await seedProblems([
      { fp: "m-low", severity: "low", decision: "false_positive" },
      { fp: "m-crit", severity: "critical", decision: "accepted_risk" },
      { fp: "m-high", severity: "high", decision: "duplicate" },
      { fp: "m-fixed", decision: "fixed" },
      { fp: "m-open", decision: "open" },
      { fp: "m-undecided" },
    ]);

    const listed = await run(decidedProblemsEffect(test.http, tenantId, main, 10));

    expect(listed.map((problem) => [problem.fingerprint, problem.status])).toEqual([
      ["m-crit", "accepted_risk"],
      ["m-high", "duplicate"],
      ["m-low", "false_positive"],
    ]);
    expect(listed[0]).toEqual({
      fingerprint: "m-crit",
      title: "title m-crit",
      class: "authz",
      file: "src/m-crit.ts",
      status: "accepted_risk",
    });
  });

  it("lists a problem of the Branch's Scans once, from the newest Scan that saw it", async () => {
    await test.raw.insert(scanFindings).values({
      tenantId,
      scanId: "s-main-new",
      findingId: "F-m-crit-again",
      fingerprint: "m-crit",
      status: "confirmed",
      severity: "critical",
      title: "newer words",
      class: "authz",
    });

    const listed = await run(decidedProblemsEffect(test.http, tenantId, main, 10));

    expect(listed.filter((problem) => problem.fingerprint === "m-crit")).toEqual([
      expect.objectContaining({ title: "newer words" }),
    ]);
  });

  it("leaves out another Branch's problems and a failed Scan's", async () => {
    await seedProblems([{ fp: "r-only", scan: "s-release", decision: "false_positive" }]);
    await seedProblems([{ fp: "failed-only", scan: "s-failed", decision: "false_positive" }]);

    const ofMain = await run(decidedProblemsEffect(test.http, tenantId, main, 10));
    const ofRelease = await run(decidedProblemsEffect(test.http, tenantId, release, 10));

    expect(ofMain.map((problem) => problem.fingerprint)).not.toContain("r-only");
    expect(ofMain.map((problem) => problem.fingerprint)).not.toContain("failed-only");
    expect(ofRelease.map((problem) => problem.fingerprint)).toEqual(["r-only"]);
  });

  it("keeps the worst ones when the cap is lower than the list", async () => {
    const listed = await run(decidedProblemsEffect(test.http, tenantId, main, 2));

    expect(listed.map((problem) => problem.fingerprint)).toEqual(["m-crit", "m-high"]);
  });

  it("is empty for a Branch with no decided problem", async () => {
    const [bare] = await test.raw
      .insert(scanRepoBranches)
      .values({ tenantId, repoId, name: "bare" })
      .returning({ id: scanRepoBranches.id });

    expect(await run(decidedProblemsEffect(test.http, tenantId, bare.id, 10))).toEqual([]);
  });
});

describe("the open problems of a Branch", () => {
  it("lists the ones no person decided and no History closed, worst first, with no evidence text", async () => {
    await seedProblems([{ fp: "m-open-crit", severity: "critical" }]);

    const listed = await run(openProblemsEffect(test.http, tenantId, main, 10));

    expect(listed.map((problem) => problem.fingerprint)).toEqual(["m-open-crit", "m-open", "m-undecided"]);
    expect(listed[0]).toEqual({
      fingerprint: "m-open-crit",
      title: "title m-open-crit",
      class: "authz",
      file: "src/m-open-crit.ts",
      severity: "critical",
    });
  });

  it("keeps the worst ones when the cap is lower than the list", async () => {
    const listed = await run(openProblemsEffect(test.http, tenantId, main, 2));

    expect(listed.map((problem) => problem.fingerprint)).toEqual(["m-open-crit", "m-open"]);
  });

  it("is empty for a Branch with no Scan", async () => {
    const [bare] = await test.raw
      .insert(scanRepoBranches)
      .values({ tenantId, repoId, name: "bare-open" })
      .returning({ id: scanRepoBranches.id });

    expect(await run(openProblemsEffect(test.http, tenantId, bare.id, 10))).toEqual([]);
  });
});

describe("the hand-over of a Scan", () => {
  const OPTIONS = {
    skill: "full",
    model: "claude-haiku-5-5",
    effort: "low",
    profile: "quick",
    maxBudgetUsd: 1,
  } as const;
  const URL = "https://github.com/octocat/Hello-World";

  it("is one open-problems.json for the check, beside decided-problems.json for the hunt", async () => {
    const files = await run(handoverFilesSvc(test.http, tenantId, URL, "main"));
    const open = files.find((file) => file.name === OPEN_PROBLEMS_FILE);

    expect(files.map((file) => file.name)).toEqual([DECIDED_PROBLEMS_FILE, OPEN_PROBLEMS_FILE]);
    expect(JSON.parse(open?.content ?? "{}").problems[0]).toMatchObject({ fingerprint: "m-open-crit" });
    expect(buildPhasePrompt(OPTIONS, "check", CONTAINER_PLACE, [OPEN_PROBLEMS_FILE])).toContain(
      OPEN_PROBLEM_CHECKS_FILE,
    );
    expect(buildPhasePrompt(OPTIONS, "hunt", CONTAINER_PLACE, [OPEN_PROBLEMS_FILE])).toBe(
      buildPhasePrompt(OPTIONS, "hunt"),
    );
  });

  it("is one decided-problems.json for a Branch with decisions, and the hunt is told about it", async () => {
    const files = await run(handoverFilesSvc(test.http, tenantId, URL, "main"));

    expect(files.map((file) => file.name)).toContain(DECIDED_PROBLEMS_FILE);
    expect(JSON.parse(files[0].content).problems[0]).toMatchObject({ fingerprint: "m-crit" });
    expect(files[0].content).not.toContain("a private note");
    expect(buildPhasePrompt(OPTIONS, "hunt", CONTAINER_PLACE, [DECIDED_PROBLEMS_FILE])).toContain(
      DECIDED_PROBLEMS_FILE,
    );
  });

  it("is nothing for a Branch with none, and the prompt is unchanged", async () => {
    const files = await run(handoverFilesSvc(test.http, tenantId, URL, "nope"));

    expect(files).toEqual([]);
    expect(buildPhasePrompt(OPTIONS, "hunt", CONTAINER_PLACE, [])).toBe(buildPhasePrompt(OPTIONS, "hunt"));
    expect(buildPhasePrompt(OPTIONS, "check", CONTAINER_PLACE, [DECIDED_PROBLEMS_FILE])).toBe(
      buildPhasePrompt(OPTIONS, "check"),
    );
    expect(buildPhasePrompt(OPTIONS, "check", CONTAINER_PLACE, [])).toBe(buildPhasePrompt(OPTIONS, "check"));
  });
});

describe("the Branch a Scan of a ref reads", () => {
  it.each([
    ["no ref: the default Branch", undefined, "main"],
    ["a branch name", "release", "release"],
    ["refs/heads/ spelling", "refs/heads/release", "release"],
    ["a name that is not tracked", "nope", null],
    ["a full commit id", "a".repeat(40), null],
  ])("%s", async (_label, ref, expected) => {
    const found = await run(decidedBranchIdEffect(test.http, tenantId, "https://github.com/octocat/Hello-World", ref));

    expect(found).toBe(expected === null ? null : expected === "main" ? main : release);
  });
});
