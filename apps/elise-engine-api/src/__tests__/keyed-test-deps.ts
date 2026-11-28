import type { DbConnectType } from "#/lib/db-connection";
import {
  claimJobSvc as claimJob,
  jobArchiveSvc as jobArchive,
  reportJobSvc as reportJob,
} from "#/modules/runners/handlers";
import { runnerSandbox as sandbox } from "#/modules/runners/lib";
import { neonScanRepo as neonRepo } from "#/modules/scan-ledger";
import { TEST_DATA_MASTER_KEY } from "./fake-bindings";

// -----
// The services that write an Account's text, with the test master
// key already given, so a service test reads like a route's call.
// -----
export const neonScanRepo = (db: DbConnectType) => neonRepo(db, TEST_DATA_MASTER_KEY);

export const runnerSandbox = (
  db: DbConnectType,
  params: Parameters<typeof sandbox>[1],
  runnerId: string,
  now?: () => Date,
) => sandbox(db, params, runnerId, now, TEST_DATA_MASTER_KEY);

export const claimJobSvc = (
  db: DbConnectType,
  runnerId: string,
  reported?: readonly string[],
  previousMaps?: Parameters<typeof claimJob>[3],
) => claimJob(db, runnerId, reported, previousMaps, TEST_DATA_MASTER_KEY);

export const reportJobSvc = (
  db: DbConnectType,
  runnerId: string,
  scanId: string,
  body: Parameters<typeof reportJob>[3],
) => reportJob(db, runnerId, scanId, body, TEST_DATA_MASTER_KEY);

export const jobArchiveSvc = (db: DbConnectType, reports: R2Bucket, runnerId: string, scanId: string) =>
  jobArchive(db, reports, runnerId, scanId, TEST_DATA_MASTER_KEY);
