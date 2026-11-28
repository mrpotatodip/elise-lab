import { z } from "zod";
import { RUNNER_JOB_QUEUE_TIMEOUT_MS, ScanUsageSchema } from "@repo/contracts/elise";
import { SCAN_KEPT_FILES } from "#/constants";
import type { DbConnectType } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import type { ScanFiles } from "#/lib/scan-file-types";
import type { ScanParams } from "#/schemas";
import { RUNNER_JOB_NO_REPORT, RUNNER_JOB_NOT_PICKED_UP, RUNNER_PROMPT_PLACE } from "#/modules/runners/constants";
import { cancelRunnerJobEffect, insertRunnerJobEffect, readRunnerJobEffect } from "#/modules/runners/queries";
import { buildAgentPrompt } from "#/modules/scan-sandbox";
import { openJobText, sealerEffect, unsealerEffect } from "#/modules/sealed-data";
import type { SandboxPort } from "#/modules/scan-workflow/types";

const FilesSchema = z.record(z.string(), z.string());

// -----
// A Runner as the Workflow's sandbox. The Workflow runs the same
// steps as for the container, and this answers them from the job
// row: launching queues the job, polling reads its state, and the
// files, usage and commit are what the Runner reported. Nothing is
// cloned or run here: the Runner does that on its own computer.
// -----
export const runnerSandbox = (
  db: DbConnectType,
  params: ScanParams,
  runnerId: string,
  now: () => Date = () => new Date(),
  masterKey?: string,
): SandboxPort => {
  const read = async () => {
    const job = await runEffect(readRunnerJobEffect(db, params.scanId));
    if (job === null) return null;
    return openJobText(await runEffect(unsealerEffect(db, masterKey, params.accountId)), job);
  };
  return {
    prepare: async () => ({ commitSha: null, branch: null }),

    putHandoverFiles: async () => undefined,

    launchAgent: async (options) => {
      const sealer = await runEffect(sealerEffect(db, masterKey, params.accountId));
      await runEffect(
        insertRunnerJobEffect(db, {
          scanId: params.scanId,
          tenantId: params.accountId,
          runnerId,
          repoUrl: params.repo,
          ref: params.ref ?? null,
          prompt: await sealer.text(buildAgentPrompt(options, RUNNER_PROMPT_PLACE)),
          optionsJson: await sealer.text(JSON.stringify(options)),
          priorsJson: await sealer.text(""),
          resumesScanId: params.resumesScanId ?? null,
        }),
      );
    },

    // -----
    // A Runner has no Outbound handler to meter a Phase, so it runs one
    // agent as before. Phases on a Runner are a later ticket.
    // -----
    launchPhase: async () => {
      throw new Error("a Runner does not run a full scan in phases yet");
    },

    capReached: async () => {
      throw new Error("a Runner does not run a full scan in phases yet");
    },

    pollAgent: async () => {
      const job = await read();
      if (job === null) return { state: "failed", error: "the runner job is missing" };
      if (job.state === "succeeded") return { state: "succeeded" };
      if (job.state === "failed") return { state: "failed", error: job.error ?? "the runner reported a failure" };
      if (job.state === "cancelled") return { state: "failed", error: "the scan ended before the runner reported" };
      const waited = now().getTime() - job.createdAt.getTime();
      if (job.state === "queued" && waited > RUNNER_JOB_QUEUE_TIMEOUT_MS)
        return { state: "failed", error: RUNNER_JOB_NOT_PICKED_UP };
      return { state: "running" };
    },

    agentLogTail: async () => (await read())?.error ?? "(no runner log)",

    readUsage: async () => {
      const job = await read();
      return job?.usageJson ? ScanUsageSchema.parse(JSON.parse(job.usageJson)) : null;
    },

    readFiles: async () => {
      const job = await read();
      const sent = job?.filesJson ? FilesSchema.parse(JSON.parse(job.filesJson)) : {};
      const files: ScanFiles = {};
      for (const name of SCAN_KEPT_FILES) {
        const text = sent[name];
        if (text !== undefined) files[name] = text;
      }
      if (files["REPORT.md"] === undefined) throw new Error(RUNNER_JOB_NO_REPORT);
      return files;
    },

    readCheckout: async () => {
      const job = await read();
      return job === null ? null : { commitSha: job.commitSha, branch: job.branch };
    },

    destroy: async () => {
      await runEffect(cancelRunnerJobEffect(db, params.scanId, now()));
    },
  };
};
