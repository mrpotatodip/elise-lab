import { Effect } from "effect";
import type { ScanUsage } from "@repo/contracts/elise";
import { NotFound, type Conflict, type DbError } from "#/lib/effect-query";
import type { TenantDbType } from "#/lib/db-connection";
import type { ScanStatus } from "#/schemas";
import { planOfEffect } from "#/modules/billing";
import { settleCreditEffect, settlementOf } from "#/modules/credit";
import { scanReads, stopScanEffect, stoppedUsageEffect } from "#/modules/scan-ledger";

export const stopScanSvc = (
  db: TenantDbType,
  accountId: string,
  scanId: string,
  now: Date,
  teardown: (scanId: string) => Promise<ScanUsage | null>,
): Effect.Effect<ScanStatus, NotFound | Conflict | DbError> =>
  Effect.gen(function* () {
    yield* stopScanEffect(db, accountId, scanId, now);
    const stopped = yield* scanReads(db).get(accountId, scanId);
    if (!stopped) return yield* new NotFound({ message: "Scan not found" });
    if (stopped.runner) return stopped;
    const metered = yield* Effect.promise(() =>
      teardown(scanId).then(
        (usage) => ({ ok: true as const, usage }),
        (cause: unknown) => {
          console.error(`stop scan ${scanId}: the sandbox was not torn down`, cause);
          return { ok: false as const, usage: null };
        },
      ),
    );
    if (!metered.ok) return stopped;
    if (metered.usage) yield* stoppedUsageEffect(db, accountId, scanId, metered.usage);
    const plan = yield* planOfEffect(db, accountId);
    if (plan) {
      const settlement = settlementOf({ status: "failed", costUsd: metered.usage?.costUsd ?? null, markup: plan.creditMarkup });
      if (settlement.ok) yield* settleCreditEffect(db, { tenantId: accountId, scanId, chargeUsd: settlement.chargeUsd });
    }
    return (yield* scanReads(db).get(accountId, scanId)) ?? stopped;
  });
