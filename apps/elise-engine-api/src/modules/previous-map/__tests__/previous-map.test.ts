import { Effect } from "effect";
import { HANDOVER_FILE_MAX } from "@repo/contracts/elise";
import { scanFiles, scans } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { branchIdOf, openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { buildPhasePrompt, CONTAINER_PLACE } from "#/modules/scan-sandbox/utils";
import { PREVIOUS_MAP_FILE } from "#/modules/previous-map/constants";
import { previousMapFilesSvc } from "#/modules/previous-map/handlers";
import { previousMapHandover } from "#/modules/previous-map/utils";

let test: TestDb;
let tenantId: string;
let main: string;

const URL = "https://github.com/octocat/Hello-World";
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

const bytes = new Map<string, string>();
const store = { read: async (key: string) => bytes.get(key) ?? null };

const seedFiles = async (scanId: string, files: Record<string, string>) => {
  for (const [name, text] of Object.entries(files)) {
    const r2Key = `accounts/${tenantId}/scans/${scanId}/${name}`;
    bytes.set(r2Key, text);
    await test.raw
      .insert(scanFiles)
      .values({ tenantId, scanId, name, r2Key, sizeBytes: text.length, contentType: "text/markdown" });
  }
};

beforeAll(async () => {
  test = await openTestDb();
  ({ tenantId } = await seedTenant(test));
  const repoId = await seedRepo(test, tenantId);
  main = await branchIdOf(test, repoId);
  await test.raw.insert(scans).values([
    scanValues(tenantId, repoId, "s-old", "2026-11-01T10:00:00Z", { skill: "full", branchId: main, partial: false }),
    scanValues(tenantId, repoId, "s-new", "2026-11-02T10:00:00Z", { skill: "full", branchId: main, partial: false }),
    scanValues(tenantId, repoId, "s-failed", "2026-11-03T10:00:00Z", {
      skill: "full",
      branchId: main,
      partial: false,
      status: "failed",
    }),
    scanValues(tenantId, repoId, "s-partial", "2026-11-04T10:00:00Z", {
      skill: "full",
      branchId: main,
      partial: true,
    }),
  ]);
});

afterAll(async () => {
  await test.close();
});

describe("the architecture map of the last Scan on a Branch", () => {
  it("is nothing for a Branch whose Scans saved no map, and the recon prompt is unchanged", async () => {
    expect(await run(previousMapFilesSvc(test.http, store, tenantId, URL, "main"))).toEqual([]);
    expect(buildPhasePrompt(OPTIONS, "recon", CONTAINER_PLACE, [])).toBe(buildPhasePrompt(OPTIONS, "recon"));
  });

  it("is one previous-map.json with the newest succeeded Scan's map and ledger", async () => {
    await seedFiles("s-old", { "architecture.md": "# old map", "coverage-ledger.json": "[]" });
    await seedFiles("s-new", { "architecture.md": "# new map", "coverage-ledger.json": '[{"coverage_id":"a"}]' });
    await seedFiles("s-failed", { "architecture.md": "# failed map" });
    await seedFiles("s-partial", { "architecture.md": "# one folder only" });

    const files = await run(previousMapFilesSvc(test.http, store, tenantId, URL, "main"));

    expect(files.map((file) => file.name)).toEqual([PREVIOUS_MAP_FILE]);
    expect(JSON.parse(files[0].content)).toEqual({
      architecture_md: "# new map",
      coverage_ledger: [{ coverage_id: "a" }],
    });
  });

  it("tells recon to update the map, and only recon", () => {
    const recon = buildPhasePrompt(OPTIONS, "recon", CONTAINER_PLACE, [PREVIOUS_MAP_FILE]);

    expect(recon).toContain(PREVIOUS_MAP_FILE);
    expect(buildPhasePrompt(OPTIONS, "hunt", CONTAINER_PLACE, [PREVIOUS_MAP_FILE])).toBe(
      buildPhasePrompt(OPTIONS, "hunt"),
    );
  });

});

describe("the hand-over built from a map", () => {
  it("drops the ledger when the two together are over the limit, then the map when it is over alone", () => {
    const ledger = JSON.stringify(["x".repeat(HANDOVER_FILE_MAX)]);

    expect(JSON.parse(previousMapHandover("# map", ledger)[0].content)).toEqual({ architecture_md: "# map" });
    expect(previousMapHandover("m".repeat(HANDOVER_FILE_MAX), null)).toEqual([]);
  });

  it("drops a ledger that is not JSON", () => {
    expect(JSON.parse(previousMapHandover("# map", "not json")[0].content)).toEqual({ architecture_md: "# map" });
  });
});

const OPTIONS = {
  skill: "full",
  model: "claude-haiku-5-5",
  effort: "low",
  profile: "quick",
  maxBudgetUsd: 1,
} as const;
