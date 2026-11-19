import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authUser, scanArchiveLinks, scanRunnerJobs, scans, scanUploadArchives } from "@repo/db-elise";
import { RUNNER_JOB_QUEUE_TIMEOUT_MS, RunnerJobSchema } from "@repo/contracts/elise";
import { SCAN_PROFILE_CAPS_USD } from "#/constants";
import { RUNNER_MAX_BUDGET_USD, RUNNER_PROMPT_PLACE } from "#/modules/runners/constants";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import type { ScanOptions, ScanParams } from "#/schemas";
import { claimJobSvc, jobArchiveSvc, jobStateSvc, reportJobSvc } from "#/modules/runners/handlers";
import { runnerSandbox } from "#/modules/runners/lib";
import { neonScanRepo } from "#/modules/scan-ledger";
import { buildScanRecordSvc, writeScanRecordEffect } from "#/modules/scan-records";
import { saveScanFilesEffect } from "#/modules/scan-store";
import { fakeBindings } from "#/__tests__/fake-bindings";
import { SCAN_SANDBOX_FULL_PHASES, buildAgentPrompt, buildPhasePrompt } from "#/modules/scan-sandbox";
import { monthSpendEffect } from "#/modules/usage";
import { claimRunnerJobEffect, createRunnerEffect, claimPairingEffect, findConnectedRunnerEffect, readRunnerJobEffect, reportRunnerJobEffect } from "#/modules/runners/queries";

let test: TestDb;
let tenantId: string;
let repoId: string;
let userId: string;
let runnerId: string;
let otherRunnerId: string;
let counter = 0;

const NOW = new Date("2026-11-11T09:00:00Z");
const OPTIONS: ScanOptions = { skill: "lite", model: "claude-sonnet-5-5", effort: "high", profile: "quick", maxBudgetUsd: 2 };

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

const pair = async (label: string) => {
  const created = await run(createRunnerEffect(test.http, { tenantId, actorUserId: userId, name: label, codeHash: `jobs-code-${label}`, expiresAt: new Date("2026-11-11T10:00:00Z") }));
  await run(claimPairingEffect(test.http, { codeHash: `jobs-code-${label}`, tokenHash: `jobs-token-${label}`, now: NOW }));
  return created.id;
};

const paramsFor = (scanId: string, over: Partial<ScanParams> = {}): ScanParams => ({
  scanId,
  accountId: tenantId,
  repo: "https://github.com/octocat/Hello-World",
  options: OPTIONS,
  keySource: "account",
  runnerId,
  createdAt: NOW.toISOString(),
  ...over,
});

const newScan = async () => {
  counter += 1;
  const scanId = `job-scan-${counter}`;
  await test.raw.insert(scans).values(scanValues(tenantId, repoId, scanId, NOW.toISOString()));
  return scanId;
};

const queue = async (scanId: string, over: Partial<ScanParams> = {}, at = NOW, options: ScanOptions = OPTIONS) => {
  await runnerSandbox(test.http, paramsFor(scanId, over), over.runnerId ?? runnerId, () => at).launchAgent(options);
  return scanId;
};

const report = (scanId: string, body: Parameters<typeof reportJobSvc>[3], by = runnerId) => run(reportJobSvc(test.http, by, scanId, body));
const jobOf = async (scanId: string) => (await run(readRunnerJobEffect(test.http, scanId)))!;

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "jobs-account");
  tenantId = seeded.tenantId;
  userId = crypto.randomUUID();
  await test.raw.insert(authUser).values({ id: userId, name: "Ada", email: "jobs@example.com", emailVerified: true, partyId: seeded.partyId });
  repoId = await seedRepo(test, tenantId);
});

// -----
// A runner of its own for every test, so a job another test left
// queued is never the one this test claims.
// -----
beforeEach(async () => {
  counter += 1;
  runnerId = await pair(`runner-${counter}`);
  otherRunnerId = await pair(`other-${counter}`);
});

afterAll(async () => {
  await test.close();
});

describe("claiming a job", () => {
  it("gives a runner its oldest queued scan once, with the prompt and the options", async () => {
    const first = await queue(await newScan());
    await queue(await newScan());
    const claimed = await run(claimJobSvc(test.http, runnerId));
    const again = await run(claimJobSvc(test.http, runnerId));

    expect(claimed).toMatchObject({ scanId: first, repo: "https://github.com/octocat/Hello-World", ref: null, skill: "lite", model: "claude-sonnet-5-5", maxBudgetUsd: 2 });
    expect(claimed?.prompt).toContain("./repo");
    expect(again?.scanId).not.toBe(first);
  });

  it("carries the Scan's profile and the cap the table gives it, next to the Runner's own ceiling", async () => {
    await queue(await newScan(), {}, NOW, { ...OPTIONS, profile: "deep", maxBudgetUsd: RUNNER_MAX_BUDGET_USD });
    const claimed = await run(claimJobSvc(test.http, runnerId));

    expect(claimed).toMatchObject({ profile: "deep", profileCapUsd: SCAN_PROFILE_CAPS_USD.deep, maxBudgetUsd: RUNNER_MAX_BUDGET_USD });
  });

  it("hands over the single prompt as it was and the four Phase prompts in order, built for the Scan's profile and the Runner's place", async () => {
    const options: ScanOptions = { ...OPTIONS, skill: "full", profile: "deep" };
    await queue(await newScan(), {}, NOW, options);
    const claimed = await run(claimJobSvc(test.http, runnerId));

    expect(claimed?.prompt).toBe(buildAgentPrompt(options, RUNNER_PROMPT_PLACE));
    expect(claimed?.phasePrompts?.map((entry) => entry.phase)).toEqual(["recon", "hunt", "check", "report"]);
    expect(claimed?.phasePrompts?.map((entry) => entry.prompt)).toEqual(SCAN_SANDBOX_FULL_PHASES.map((phase) => buildPhasePrompt(options, phase, RUNNER_PROMPT_PLACE)));
    expect(claimed?.phasePrompts?.every((entry) => entry.prompt.includes("Profile: deep") && entry.prompt.includes("./repo"))).toBe(true);
    expect(RunnerJobSchema.parse(claimed).phasePrompts).toHaveLength(4);
  });

  it("still parses a job from before profiles, with no profile or cap", () => {
    const oldJob = { scanId: "s1", repo: "https://github.com/o/n", ref: null, skill: "lite", model: "claude-sonnet-5-5", effort: "high", maxBudgetUsd: 2, prompt: "audit ./repo", priorsJson: "" };

    expect(RunnerJobSchema.parse(oldJob)).toEqual(oldJob);
  });

  it("fails a job whose options cannot be read and hands over the next one", async () => {
    const broken = await queue(await newScan());
    await test.raw.update(scanRunnerJobs).set({ optionsJson: "not json" }).where(eq(scanRunnerJobs.scanId, broken));
    const next = await queue(await newScan());
    const claimed = await run(claimJobSvc(test.http, runnerId));

    expect(claimed?.scanId).toBe(next);
    expect(await jobOf(broken)).toMatchObject({ state: "failed", error: expect.stringContaining("could not be read") });
  });

  it("keeps a Runner scan's cost estimate out of the month's spend and counts a plain scan's cost", async () => {
    const monthStart = new Date("2026-11-01T00:00:00Z");
    const before = (await run(monthSpendEffect(test.http, tenantId, monthStart))).spentUsd;
    const onRunner = await newScan();
    await test.raw.update(scans).set({ costUsd: "4.0000" }).where(eq(scans.id, onRunner));
    await queue(onRunner);
    counter += 1;
    await test.raw.insert(scans).values(scanValues(tenantId, repoId, `job-plain-${counter}`, NOW.toISOString(), { costUsd: "0.5000" }));
    const after = (await run(monthSpendEffect(test.http, tenantId, monthStart))).spentUsd;

    expect(after - before).toBeCloseTo(0.5);
  });

  it("names the Runner on the scan it ran, and none on a cloud scan", async () => {
    const onRunner = await queue(await newScan());
    const inCloud = await newScan();
    const repo = neonScanRepo(test.http);

    expect(await run(repo.get(tenantId, onRunner))).toMatchObject({ runner: { id: runnerId, name: expect.stringMatching(/^runner-\d+$/) } });
    expect((await run(repo.get(tenantId, inCloud)))?.runner).toBeNull();
  });

  it("cancels the job of a scan that stalled when a newer scan of the repo starts", async () => {
    counter += 1;
    const stalledId = `job-stalled-${counter}`;
    await test.raw.insert(scans).values(scanValues(tenantId, repoId, stalledId, NOW.toISOString(), { status: "running" }));
    await queue(stalledId);
    await run(neonScanRepo(test.http).create(paramsFor(`job-newer-${counter}`, { runnerId: undefined }), repoId, Date.now() + 200 * 60 * 1000));

    expect((await jobOf(stalledId)).state).toBe("cancelled");
  });

  it("gives a runner nothing that was queued for another", async () => {
    await run(claimRunnerJobEffect(test.http, otherRunnerId, NOW));
    await queue(await newScan());

    expect(await run(claimRunnerJobEffect(test.http, otherRunnerId, NOW))).toBeNull();
  });
});

describe("reading a job's state", () => {
  it("tells the Runner that holds the job its state, and claimed turns cancelled when the Scan is stopped", async () => {
    const scanId = await queue(await newScan());
    await run(claimRunnerJobEffect(test.http, runnerId, NOW));
    const running = await run(jobStateSvc(test.http, runnerId, scanId));
    await runnerSandbox(test.http, paramsFor(scanId), runnerId, () => NOW).destroy();
    const stopped = await run(jobStateSvc(test.http, runnerId, scanId));

    expect([running, stopped]).toEqual([{ state: "claimed" }, { state: "cancelled" }]);
  });

  it("does not find a job another Runner holds, or one that does not exist", async () => {
    const scanId = await queue(await newScan());
    const other = await Effect.runPromise(Effect.flip(jobStateSvc(test.http, otherRunnerId, scanId)));
    const missing = await Effect.runPromise(Effect.flip(jobStateSvc(test.http, runnerId, "no-such-scan")));

    expect([other._tag, missing._tag]).toEqual(["NotFound", "NotFound"]);
  });
});

describe("reporting a job", () => {
  const FILES = { "REPORT.md": "# Report", "findings.json": "{}" };
  const AGENT_LOG = JSON.stringify({ total_cost_usd: 1.5, num_turns: 4, duration_ms: 9000, usage: { input_tokens: 10, output_tokens: 20 } });

  const claimed = async (over: Partial<ScanParams> = {}) => {
    const scanId = await queue(await newScan(), over);
    await run(claimRunnerJobEffect(test.http, runnerId, NOW));
    return scanId;
  };

  it("keeps the files, and the usage with the agent's own cost estimate", async () => {
    const scanId = await claimed();
    await report(scanId, { state: "succeeded", agentLog: AGENT_LOG, files: { ...FILES, "notes.txt": "dropped" } });
    const job = await jobOf(scanId);

    expect(job.state).toBe("succeeded");
    expect(JSON.parse(job.filesJson ?? "{}")).toEqual(FILES);
    expect(JSON.parse(job.usageJson ?? "{}")).toMatchObject({ inputTokens: 10, outputTokens: 20, costUsd: 1.5, turns: 4 });
  });

  it("fails a scan that reports success without REPORT.md", async () => {
    const scanId = await claimed();
    await report(scanId, { state: "succeeded", files: { "findings.json": "{}" } });

    expect(await jobOf(scanId)).toMatchObject({ state: "failed", error: "the audit finished without writing REPORT.md" });
  });

  it("keeps the failure the runner reports", async () => {
    const scanId = await claimed();
    await report(scanId, { state: "failed", error: "claude exited 1: not logged in" });

    expect(await jobOf(scanId)).toMatchObject({ state: "failed", error: "claude exited 1: not logged in" });
  });

  it.each([
    ["no ref, HEAD on main", undefined, { commitSha: "a".repeat(40), headBranch: "main", kind: null }, "main"],
    ["no ref, a detached HEAD", undefined, { commitSha: "a".repeat(40), headBranch: "HEAD", kind: null }, null],
    ["a ref fetched as a branch", "release", { commitSha: "a".repeat(40), headBranch: "HEAD", kind: "branch" }, "release"],
    ["a ref that is not a branch", "v1.2.0", { commitSha: "a".repeat(40), headBranch: "HEAD", kind: "other" }, null],
  ] as const)("works out the branch for %s", async (_name, ref, checkout, branch) => {
    const scanId = await claimed({ ref });
    await report(scanId, { state: "succeeded", checkout, files: FILES });

    expect(await jobOf(scanId)).toMatchObject({ commitSha: "a".repeat(40), branch });
  });

  it("keeps an upload Scan on its zip's hash and the app's hidden Branch, whatever the runner reports", async () => {
    const scanId = await claimed();
    const sha = "c".repeat(64);
    const [archive] = await test.raw
      .insert(scanUploadArchives)
      .values({ tenantId, repoId, label: "app-1.3.zip", r2Key: `accounts/${tenantId}/uploads/${repoId}/${scanId}.zip`, sizeBytes: 10, contentSha256: sha })
      .returning();
    await test.raw.insert(scanArchiveLinks).values({ scanId, tenantId, archiveId: archive.id, label: archive.label, contentSha256: sha });
    await report(scanId, { state: "succeeded", checkout: { commitSha: "a".repeat(40), headBranch: "main", kind: null }, files: FILES });

    expect(await jobOf(scanId)).toMatchObject({ commitSha: sha, branch: "upload" });
  });

  it("refuses a report from a runner that did not claim the scan", async () => {
    const scanId = await claimed();
    const failure = await Effect.runPromise(Effect.flip(reportJobSvc(test.http, otherRunnerId, scanId, { state: "succeeded", files: FILES })));

    expect(failure).toMatchObject({ _tag: "NotFound" });
  });

  it("refuses a second report, and a report for a scan that ended", async () => {
    const scanId = await claimed();
    await report(scanId, { state: "succeeded", files: FILES });
    const second = await Effect.runPromise(Effect.flip(reportJobSvc(test.http, runnerId, scanId, { state: "failed", error: "late" })));

    const cancelledId = await claimed();
    await runnerSandbox(test.http, paramsFor(cancelledId), runnerId, () => NOW).destroy();
    const late = await Effect.runPromise(Effect.flip(reportJobSvc(test.http, runnerId, cancelledId, { state: "succeeded", files: FILES })));

    expect([second._tag, late._tag]).toEqual(["NotFound", "NotFound"]);
    expect((await jobOf(cancelledId)).state).toBe("cancelled");
  });
});

describe("the runner as a sandbox", () => {
  it("shows a scan running while it waits and while it is claimed, and not picked up after ten minutes", async () => {
    const scanId = await queue(await newScan());
    const queuedAt = (await jobOf(scanId)).createdAt.getTime();
    const at = (ms: number) => runnerSandbox(test.http, paramsFor(scanId), runnerId, () => new Date(queuedAt + ms));

    const waiting = await at(1000).pollAgent();
    const late = await at(RUNNER_JOB_QUEUE_TIMEOUT_MS + 1000).pollAgent();
    await run(claimRunnerJobEffect(test.http, runnerId, NOW));
    const claimedLate = await at(RUNNER_JOB_QUEUE_TIMEOUT_MS + 1000).pollAgent();

    expect({ waiting, claimedLate }).toEqual({ waiting: { state: "running" }, claimedLate: { state: "running" } });
    expect(late).toMatchObject({ state: "failed", error: expect.stringContaining("did not pick up") });
  });

  it("hands the Workflow the files, the usage and the commit the runner reported", async () => {
    const scanId = await queue(await newScan());
    await run(claimRunnerJobEffect(test.http, runnerId, NOW));
    await report(scanId, {
      state: "succeeded",
      agentLog: JSON.stringify({ total_cost_usd: 3, usage: { input_tokens: 5 } }),
      checkout: { commitSha: "b".repeat(40), headBranch: "main", kind: null },
      files: { "REPORT.md": "# Report" },
    });
    const sandbox = runnerSandbox(test.http, paramsFor(scanId), runnerId);

    expect(await sandbox.pollAgent()).toEqual({ state: "succeeded" });
    expect(await sandbox.readFiles()).toEqual({ "REPORT.md": "# Report" });
    expect(await sandbox.readUsage()).toMatchObject({ inputTokens: 5, costUsd: 3 });
    expect(await sandbox.readCheckout()).toEqual({ commitSha: "b".repeat(40), branch: "main" });
  });

  it("refuses a private repository before anything is queued", async () => {
    const github = { installationRowId: crypto.randomUUID(), installationId: 1, repoId: 1, repo: "o/n", isPrivate: true };
    const sandbox = runnerSandbox(test.http, paramsFor("job-scan-private", { github }), runnerId);

    await expect(sandbox.prepare("https://github.com/o/n")).rejects.toThrow("private repository");
  });

  it("keeps a Runner scan out of the month's scan count and counts a plain one", async () => {
    const monthStart = new Date("2026-11-01T00:00:00Z");
    const before = (await run(monthSpendEffect(test.http, tenantId, monthStart))).scans;
    await queue(await newScan());
    await newScan();
    const after = (await run(monthSpendEffect(test.http, tenantId, monthStart))).scans;

    expect(after - before).toBe(1);
  });

  it("leaves a finished job as it was when the scan cleans up", async () => {
    const scanId = await queue(await newScan());
    await run(claimRunnerJobEffect(test.http, runnerId, NOW));
    await run(reportRunnerJobEffect(test.http, { scanId, runnerId, state: "succeeded", error: null, commitSha: null, branch: null, usageJson: null, filesJson: "{}", now: NOW }));
    await runnerSandbox(test.http, paramsFor(scanId), runnerId, () => NOW).destroy();

    expect((await jobOf(scanId)).state).toBe("succeeded");
  });
});

describe("an upload Scan on a Runner", () => {
  const BOTH = ["git", "archive"];
  const ZIP_BYTES = "zip-bytes";

  const uploadScan = async (bucket = fakeBindings().env.REPORTS) => {
    const scanId = await queue(await newScan());
    const r2Key = `accounts/${tenantId}/uploads/${repoId}/${scanId}.zip`;
    const [archive] = await test.raw.insert(scanUploadArchives).values({ tenantId, repoId, label: "app-1.3.zip", r2Key, sizeBytes: 9, contentSha256: "d".repeat(64) }).returning();
    await test.raw.insert(scanArchiveLinks).values({ scanId, tenantId, archiveId: archive.id, label: archive.label, contentSha256: archive.contentSha256 });
    await bucket.put(r2Key, ZIP_BYTES);
    return { scanId, archiveId: archive.id };
  };

  const download = (scanId: string, by: string, bucket: R2Bucket) => Effect.runPromise(Effect.either(jobArchiveSvc(test.http, bucket, by, scanId)));

  it("hands the job an archive source with the zip's id, and a git job a git source", async () => {
    const { scanId, archiveId } = await uploadScan();
    const gitScan = await queue(await newScan());
    const first = await run(claimJobSvc(test.http, runnerId, BOTH));
    const second = await run(claimJobSvc(test.http, runnerId, BOTH));

    expect([first?.scanId, first?.source, second?.scanId, second?.source]).toEqual([scanId, { kind: "archive", archiveId }, gitScan, { kind: "git" }]);
  });

  it.each([
    ["reports only git", ["git"]],
    ["reports nothing", undefined],
  ])("never hands an archive job to a Runner that %s, and hands it the git job queued after", async (_name, sources) => {
    const { scanId } = await uploadScan();
    const gitScan = await queue(await newScan());
    const claimed = await run(claimJobSvc(test.http, runnerId, sources));

    expect([claimed?.scanId, (await jobOf(scanId)).state]).toEqual([gitScan, "queued"]);
  });

  it("remembers what the Runner reported, so an upload Scan can be refused before it is queued", async () => {
    const before = await run(findConnectedRunnerEffect(test.http, tenantId, runnerId));
    await run(claimJobSvc(test.http, runnerId, ["archive", "git", "svn"]));
    const after = await run(findConnectedRunnerEffect(test.http, tenantId, runnerId));
    await run(claimJobSvc(test.http, runnerId));
    const older = await run(findConnectedRunnerEffect(test.http, tenantId, runnerId));

    expect([before, after, older]).toEqual([["git"], ["git", "archive"], ["git"]]);
  });

  it("fails a queued upload Scan whose zip was removed, saying so, and hands over the next job", async () => {
    const { scanId, archiveId } = await uploadScan();
    await test.raw.delete(scanUploadArchives).where(eq(scanUploadArchives.id, archiveId));
    const next = await queue(await newScan());
    const claimed = await run(claimJobSvc(test.http, runnerId, BOTH));

    expect(claimed?.scanId).toBe(next);
    expect(await jobOf(scanId)).toMatchObject({ state: "failed", error: expect.stringContaining("reads was removed") });
  });

  it("serves the zip only to the Runner that claimed the job", async () => {
    const bucket = fakeBindings().env.REPORTS;
    const { scanId } = await uploadScan(bucket);
    const unclaimed = await download(scanId, runnerId, bucket);
    await run(claimJobSvc(test.http, runnerId, BOTH));
    const mine = await download(scanId, runnerId, bucket);
    const other = await download(scanId, otherRunnerId, bucket);

    expect(unclaimed).toMatchObject({ _tag: "Left", left: { _tag: "NotFound" } });
    expect(mine).toMatchObject({ _tag: "Right", right: { body: ZIP_BYTES } });
    expect(other).toMatchObject({ _tag: "Left", left: { _tag: "NotFound" } });
  });

  it("refuses the zip once it is removed, saying so", async () => {
    const bucket = fakeBindings().env.REPORTS;
    const { scanId, archiveId } = await uploadScan(bucket);
    await run(claimJobSvc(test.http, runnerId, BOTH));
    await test.raw.delete(scanUploadArchives).where(eq(scanUploadArchives.id, archiveId));

    expect(await download(scanId, runnerId, bucket)).toMatchObject({ _tag: "Left", left: { _tag: "NotFound", message: expect.stringContaining("reads was removed") } });
  });

  it("refuses a git job's download", async () => {
    const bucket = fakeBindings().env.REPORTS;
    const scanId = await queue(await newScan());
    await run(claimJobSvc(test.http, runnerId, BOTH));

    expect(await download(scanId, runnerId, bucket)).toMatchObject({ _tag: "Left", left: { _tag: "NotFound" } });
  });
});

type LedgerUnit ={ status: string; agent_id: string | null; unresolved: string[] };
const ledgerUnit = (over: Partial<LedgerUnit>) => ({ status: "covered", agent_id: "hunter-inline", wave: 1, attempts: [], local_checks: [], result_fingerprints: [], unresolved: [], ...over });

describe("the profile met after a Runner's result", () => {
  const FULL_OPTIONS: ScanOptions = { ...OPTIONS, skill: "full", profile: "deep" };
  const FOCUSED_FILES = {
    "REPORT.md": "# Report",
    "findings.json": "[]",
    "coverage-ledger.json": JSON.stringify([ledgerUnit({}), ledgerUnit({ status: "deferred", agent_id: null, unresolved: ["quick_profile_final_critic"] })]),
    "run-metadata.json": JSON.stringify({ run_id: "run-1", profile: "quick", run_status: "complete" }),
  };

  const recordedAfterResult = async (files: Record<string, string>) => {
    const scanId = await newScan();
    await test.raw.update(scans).set({ skill: "full", profile: "deep" }).where(eq(scans.id, scanId));
    const params = paramsFor(scanId, { options: FULL_OPTIONS });
    await runnerSandbox(test.http, params, runnerId, () => NOW).launchAgent(FULL_OPTIONS);
    await run(claimRunnerJobEffect(test.http, runnerId, NOW));
    await report(scanId, { state: "succeeded", files });

    const bindings = fakeBindings();
    await run(saveScanFilesEffect(bindings.env.REPORTS, tenantId, scanId, await runnerSandbox(test.http, params, runnerId).readFiles()));
    const record = await run(buildScanRecordSvc(bindings.env.REPORTS, params, repoId, { id: null, name: null, reason: null }, "succeeded", null, null));
    await run(writeScanRecordEffect(test.http, record));
    return scanId;
  };

  it("keeps what the Scan met on its row and shows it on the Scan, an Exhaustive Scan whose files show Balanced work reading standard", async () => {
    const scanId = await recordedAfterResult(FOCUSED_FILES);

    expect((await test.raw.select({ profileMet: scans.profileMet }).from(scans).where(eq(scans.id, scanId)))[0].profileMet).toBe("standard");
    expect(await run(neonScanRepo(test.http).get(tenantId, scanId))).toMatchObject({ profile: "deep", profileMet: "standard" });
  });

  it("keeps none on the row of a result that wrote no ledger, and null on the Scan of an old row", async () => {
    const { "coverage-ledger.json": _ledger, ...noLedger } = FOCUSED_FILES;
    const scanId = await recordedAfterResult(noLedger);
    const old = await newScan();

    expect((await run(neonScanRepo(test.http).get(tenantId, scanId)))?.profileMet).toBe("none");
    expect((await run(neonScanRepo(test.http).get(tenantId, old)))?.profileMet).toBeNull();
  });
});
