import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { runEffect } from "#/lib/effect-query";
import { dbConnect, type DbConnectType } from "#/lib/db-connection";
import type { ScanParams } from "#/schemas";
import { findSealedKeyEffect } from "#/modules/anthropic-key";
import { findBranchEffect, findBranchesAtTipEffect, isCommitId } from "#/modules/branches";
import { runnerSandbox } from "#/modules/runners/lib";
import { neonScanRepo } from "#/modules/scan-ledger";
import { listPriorsEffect, recordScanSvc, SCAN_RECORDS_PRIOR_LIMIT, type PriorFinding } from "#/modules/scan-records";
import { SCAN_SANDBOX_FULL_PHASES } from "#/modules/scan-sandbox";
import { SCAN_WORKFLOW_FULL_MAX_POLLS } from "#/modules/scan-workflow/constants";
import type { Bindings } from "#/types/variables";
import { runScan } from "./run-scan";
import { settleScanCredit } from "./settle-scan-credit";

const branchAtTip = async (db: DbConnectType, accountId: string, repoId: string, ref: string | null | undefined) => {
  if (!ref || !isCommitId(ref)) return null;
  const atTip = await runEffect(findBranchesAtTipEffect(db, accountId, repoId, ref.toLowerCase()));
  return atTip.length === 1 ? atTip[0] : null;
};

// -----
// What the agent is asked to re-check: the unresolved findings
// of the branch it is reading. runScan asks only for a Scan of
// the one skill whose findings move the History: a profile Scan
// gets no priors (the History is frozen). A scan with no tracked
// branch (a tag, an older commit, an untracked name, or a branch
// with no History yet) gets none: its checkout is not the code a
// History is about. A commit that is the latest of one tracked
// branch is that branch's code, so it gets that branch's list.
// -----
const priorsOf = async (env: Bindings, params: ScanParams): Promise<PriorFinding[]> => {
  const db = dbConnect(env.DATABASE_URL);
  const scan = await runEffect(neonScanRepo(db).get(params.accountId, params.scanId));
  if (!scan) return [];
  const branch = scan.branch
    ? await runEffect(findBranchEffect(db, params.accountId, scan.repoId, scan.branch))
    : await branchAtTip(db, params.accountId, scan.repoId, scan.ref);
  return branch ? runEffect(listPriorsEffect(db, params.accountId, branch.id, SCAN_RECORDS_PRIOR_LIMIT)) : [];
};

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
        maxPolls: SCAN_WORKFLOW_FULL_MAX_POLLS,
        phases: event.payload.runnerId ? undefined : SCAN_SANDBOX_FULL_PHASES,
        sandbox: event.payload.runnerId ? runnerSandbox(dbConnect(this.env.DATABASE_URL), event.payload, event.payload.runnerId) : this.env.SANDBOX_FULL.getByName(event.payload.scanId),
        ledger: neonScanRepo(dbConnect(this.env.DATABASE_URL)),
        reports: this.env.REPORTS,
        readPriors: (params) => priorsOf(this.env, params),
        sealedKeyFor: (accountId) => runEffect(findSealedKeyEffect(dbConnect(this.env.DATABASE_URL), accountId)),
        recordScan: (params, status, error, usage) => runEffect(recordScanSvc(this.env, params, status, error, usage)),
        settleCredit: (params, status, usage) => settleScanCredit(this.env, params, status, usage),
      },
      event.payload,
      step,
    );
  }
}
