import type { ScanUsage } from "@repo/contracts/elise";
import { dbConnect, poolConnect } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import type { ScanParams } from "#/schemas";
import { planOfEffect } from "#/modules/billing";
import { settleCreditEffect, settlementOf } from "#/modules/credit";
import { scanStoppedEffect } from "#/modules/runners/queries";
import type { Bindings } from "#/types/variables";

// -----
// Takes a finished scan's real charge from its hold. A scan on the
// Account's own key never held credit, and an Account with no plan
// never did either. The markup is the plan's now: a plan changed
// while a scan ran charges it at the new markup. A succeeded scan
// with no cost is not settled and its hold stays, because charging
// it nothing would give the work away: the meter has to be fixed.
// A Stopped Scan is left to the Stop, which settles it with the
// cost metered: a Workflow that reaches its end after the Stop
// has no meter left and must not win with a zero charge.
// -----
export const settleScanCredit = async (env: Bindings, params: ScanParams, status: "succeeded" | "failed", usage: ScanUsage | null): Promise<void> => {
  if (params.keySource === "account") return;
  const owner = dbConnect(env.DATABASE_URL);
  if (await runEffect(scanStoppedEffect(owner, params.scanId))) return;
  const plan = await runEffect(planOfEffect(owner, params.accountId));
  if (plan === null) return;
  const settlement = settlementOf({ status, costUsd: usage === null ? null : usage.costUsd, markup: plan.creditMarkup });
  if (!settlement.ok) {
    console.error(`scan ${params.scanId}: succeeded with no cost, so its credit hold was left in place`);
    return;
  }
  const { db, close } = poolConnect(env.DATABASE_URL);
  try {
    await runEffect(settleCreditEffect(db, { tenantId: params.accountId, scanId: params.scanId, chargeUsd: settlement.chargeUsd }));
  } finally {
    await close();
  }
};
