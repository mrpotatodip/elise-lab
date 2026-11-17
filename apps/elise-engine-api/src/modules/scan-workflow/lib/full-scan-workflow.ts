import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { runEffect } from "#/lib/effect-query";
import { dbConnect } from "#/lib/db-connection";
import type { ScanParams } from "#/schemas";
import { findSealedKeyEffect } from "#/modules/anthropic-key";
import { runnerSandbox } from "#/modules/runners/lib";
import { neonScanRepo } from "#/modules/scan-ledger";
import { recordScanSvc } from "#/modules/scan-records";
import { SCAN_SANDBOX_FULL_PHASES } from "#/modules/scan-sandbox";
import type { Bindings } from "#/types/variables";
import { maxPollsOf } from "./max-polls";
import { runScan } from "./run-scan";
import { settleScanCredit } from "./settle-scan-credit";

// -----
// The Workflow of a Scan: every new Scan, on the platform's key, on the
// Account's own key and on a Runner, runs here. A Scan in our cloud runs
// the four Phases in FullScanSandbox; a Scan on a Runner is one run of
// the agent on the person's computer, whose job row stands in for the
// sandbox. A Scan that is running keeps this class, so never rename it.
// Decisions: ADR 0006.
// -----
export class FullScanWorkflow extends WorkflowEntrypoint<Bindings, ScanParams> {
  async run(event: WorkflowEvent<ScanParams>, step: WorkflowStep) {
    return runScan(
      {
        maxPolls: maxPollsOf(event.payload.runnerId),
        phases: event.payload.runnerId ? undefined : SCAN_SANDBOX_FULL_PHASES,
        sandbox: event.payload.runnerId ? runnerSandbox(dbConnect(this.env.DATABASE_URL), event.payload, event.payload.runnerId) : this.env.SANDBOX_FULL.getByName(event.payload.scanId),
        ledger: neonScanRepo(dbConnect(this.env.DATABASE_URL)),
        reports: this.env.REPORTS,
        sealedKeyFor: (accountId) => runEffect(findSealedKeyEffect(dbConnect(this.env.DATABASE_URL), accountId)),
        recordScan: (params, status, error, usage) => runEffect(recordScanSvc(this.env, params, status, error, usage)),
        settleCredit: (params, status, usage) => settleScanCredit(this.env, params, status, usage),
      },
      event.payload,
      step,
    );
  }
}
