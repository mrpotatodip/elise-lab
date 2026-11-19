import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { scanRunnerJobs, scans, scanTraceEntries, tenantRunners } from "@repo/db-elise/schema";
import { TRACE_ENTRIES_PER_SCAN_MAX, TraceSavedSchema, TraceSchema, type SaveTraceBody, type TraceEntry, type RunnerIdentity } from "@repo/contracts/elise";
import { fakeBindings, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { z } from "zod";

const RUNNER_TOKEN = "trace-runner-token";
const OTHER_RUNNER_TOKEN = "trace-other-runner-token";
const NOW = "2026-11-19T09:00:00.000Z";
// -----
// After one insert of thousands of rows, pglite no longer shows the
// rows written before it, so the cap test seeds its rows in pieces.
// -----
const SEED_CHUNK = 500;

const SavedEnvelope = z.object({ data: TraceSavedSchema });
const TraceEnvelope = z.object({ data: TraceSchema });

let test: TestDb;
let tenantId: string;
let otherTenantId: string;
let runner: RunnerIdentity;
let otherRunner: RunnerIdentity;
let counter = 0;

const identities = new Map<string, () => RunnerIdentity>([
  [RUNNER_TOKEN, () => runner],
  [OTHER_RUNNER_TOKEN, () => otherRunner],
]);

const app = tenantRouteApp(() => test, { runnerIdentity: async (_c, token) => identities.get(token)?.() ?? null });

// -----
// A UUIDv7 with a given tail, so a test names its entries.
// -----
const entryId = (n: number) => `0190f1a2-b3c4-7d5e-8f60-${n.toString(16).padStart(12, "0")}`;

const entry = (n: number, over: Partial<TraceEntry> = {}): TraceEntry => ({
  id: entryId(n),
  label: "reading_files",
  phase: "recon",
  startedAt: new Date(Date.parse(NOW) + n * 1000).toISOString(),
  endedAt: new Date(Date.parse(NOW) + n * 1000 + 500).toISOString(),
  count: 1,
  ...over,
});

const post = (scanId: string, body: SaveTraceBody, token = RUNNER_TOKEN) => {
  const { env } = fakeBindings();
  const headers = new Headers({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  return app.fetch(new Request(`http://localhost/runners/jobs/${scanId}/trace`, { method: "POST", headers, body: JSON.stringify(body) }), env, testExecutionContext);
};

const save = async (scanId: string, body: SaveTraceBody, token = RUNNER_TOKEN) => SavedEnvelope.parse(await (await post(scanId, body, token)).json()).data;

const read = async (scanId: string, after?: string, accountId = tenantId) => {
  const res = await callAs(app, accountId, `/scans/${scanId}/trace${after ? `?after=${encodeURIComponent(after)}` : ""}`);
  return { status: res.status, body: await res.json() };
};

const readTrace = async (scanId: string, after?: string) => TraceEnvelope.parse((await read(scanId, after)).body).data;

const pairRunner = async (accountId: string, partyId: string, name: string): Promise<RunnerIdentity> => {
  const [row] = await test.raw.insert(tenantRunners).values({ tenantId: accountId, name, createdBy: partyId, tokenHash: `hash-${name}` }).returning();
  return { runnerId: row.id, name, accountId, accountName: "acme" };
};

// -----
// A Scan of the Account with a job claimed by its Runner.
// -----
const runnerScan = async (accountId = tenantId, by = runner) => {
  counter += 1;
  const scanId = `trace-scan-${counter}`;
  const repoId = await seedRepo(test, accountId, `https://github.com/octocat/trace-${counter}`);
  await test.raw.insert(scans).values(scanValues(accountId, repoId, scanId, NOW, { status: "running", step: "auditing", skill: "full" }));
  await test.raw.insert(scanRunnerJobs).values({ scanId, tenantId: accountId, runnerId: by.runnerId, state: "claimed", repoUrl: "https://github.com/octocat/Hello-World", prompt: "audit", optionsJson: "{}", priorsJson: "" });
  return scanId;
};

beforeAll(async () => {
  test = await openTestDb();
  const own = await seedTenant(test, "trace-own");
  const other = await seedTenant(test, "trace-other");
  tenantId = own.tenantId;
  otherTenantId = other.tenantId;
  runner = await pairRunner(tenantId, own.partyId, "laptop");
  otherRunner = await pairRunner(otherTenantId, other.partyId, "theirs");
});

afterAll(async () => {
  await test.close();
});

describe("a Scan's Trace", () => {
  it("reads back a posted batch, and after its cursor only what changed", async () => {
    const scanId = await runnerScan();
    await save(scanId, { entries: [entry(1, { label: "phase_started" }), entry(2)] });
    const first = await readTrace(scanId);
    await save(scanId, { entries: [entry(3, { label: "searching" })] });
    const next = await readTrace(scanId, first.cursor ?? undefined);

    expect(first.entries.map((item) => [item.id, item.label])).toEqual([
      [entryId(1), "phase_started"],
      [entryId(2), "reading_files"],
    ]);
    expect(next.entries.map((item) => item.id)).toEqual([entryId(3)]);
  });

  it("keeps one row for a retried batch, and returns a grown entry again after the cursor", async () => {
    const scanId = await runnerScan();
    await save(scanId, { entries: [entry(1), entry(2)] });
    await save(scanId, { entries: [entry(1), entry(2)] });
    const before = await readTrace(scanId);
    await save(scanId, { entries: [entry(2, { count: 14 })], candidateFindings: 3 });
    const after = await readTrace(scanId, before.cursor ?? undefined);

    expect(before.entries.map((item) => item.id)).toEqual([entryId(1), entryId(2)]);
    expect(after.entries.map((item) => [item.id, item.count])).toEqual([[entryId(2), 14]]);
    expect(after.candidateFindings).toBe(3);
  });

  it("reads a Scan with no entries as an empty Trace", async () => {
    const scanId = await runnerScan();

    expect(await readTrace(scanId)).toEqual({ entries: [], cursor: null, candidateFindings: null });
  });

  it("keeps a Trace from another Account, and from another Runner", async () => {
    const scanId = await runnerScan();
    await save(scanId, { entries: [entry(1)] });
    const theirScan = await runnerScan(otherTenantId, otherRunner);
    const theirRead = await read(scanId, undefined, otherTenantId);
    const intoTheirs = await post(theirScan, { entries: [entry(2)] });
    const fromTheirs = await post(scanId, { entries: [entry(3)] }, OTHER_RUNNER_TOKEN);

    expect([theirRead.status, intoTheirs.status, fromTheirs.status]).toEqual([404, 404, 404]);
    expect((await readTrace(scanId)).entries.map((item) => item.id)).toEqual([entryId(1)]);
  });

  it("drops new entries past the cap but still lets a kept entry grow, and the Scan runs on", async () => {
    const scanId = await runnerScan();
    const seeded = Array.from({ length: TRACE_ENTRIES_PER_SCAN_MAX - 1 }, (_, n) => ({ ...entry(n + 100), tenantId, scanId, startedAt: new Date(NOW), endedAt: new Date(NOW) }));
    for (let from = 0; from < seeded.length; from += SEED_CHUNK) await test.raw.insert(scanTraceEntries).values(seeded.slice(from, from + SEED_CHUNK));
    const full = await save(scanId, { entries: [entry(1), entry(2), entry(3)] });
    const grown = await save(scanId, { entries: [entry(1, { count: 5 }), entry(4)] });
    const [scan] = await test.raw.select({ status: scans.status }).from(scans).where(eq(scans.id, scanId));

    expect([full, grown]).toEqual([
      { accepted: 1, dropped: 2 },
      { accepted: 1, dropped: 1 },
    ]);
    expect((await readTrace(scanId)).entries).toHaveLength(TRACE_ENTRIES_PER_SCAN_MAX);
    expect(scan.status).toBe("running");
  });
});
