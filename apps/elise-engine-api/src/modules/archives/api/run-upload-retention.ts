import { withPool } from "#/lib/db-connection";
import { runEffect } from "#/lib/effect-query";
import { sweepUploadsSvc, type UploadSweep } from "#/modules/archives/handlers";
import type { Bindings } from "#/types/variables";

// -----
// The Worker's cron trigger (wrangler.jsonc "triggers") runs this
// once a day. It has no request and no Account, so it opens the
// owner connection; every query it runs touches upload rows only.
// -----
export const runUploadRetention = (env: Bindings, waitUntil: (promise: Promise<unknown>) => void): Promise<UploadSweep> =>
  withPool(env.DATABASE_URL, waitUntil, (db) => runEffect(sweepUploadsSvc(db, env.REPORTS, new Date())));
