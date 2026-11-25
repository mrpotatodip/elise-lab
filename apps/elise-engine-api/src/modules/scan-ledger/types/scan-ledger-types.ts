import type { Effect } from "effect";
import type { ScanArtifact, ScanUsage } from "@repo/contracts/elise";
import type { Conflict, DbError } from "#/lib/effect-query";
import type { ScanParams, ScanState, ScanStatus } from "#/schemas";
import type { SourceProviderId } from "#/providers/registry";

// -----
// What changes on the way: state, step, error and
// what was spent. Anything left out stays as it is.
// -----
export type ScanPatch = {
  status?: ScanState;
  step?: ScanStatus["step"];
  error?: string | null;
  usage?: ScanUsage | null;
  commitSha?: string | null;
  branch?: string | null;
};

export type RepoRecord = { id: string; canonical: string; url: string };

export type ScanFilter = { repoId?: string; status?: ScanState };

export type NewScanFile = ScanArtifact & { r2Key: string };

export type ScanFileRef = { r2Key: string; contentType: string };

export type ScanPage ={ scans: ScanStatus[]; nextCursor: string | null };

// -----
// Neon is the record of every scan. The workflow
// writes it; the routes only read it. R2 holds the
// bytes of each file, and scan_files says where.
// -----
export type ScanRepo = {
  ensureRepo: (accountId: string, url: string, provider?: SourceProviderId) => Effect.Effect<RepoRecord, DbError>;
  restoreRepo: (accountId: string, repoId: string, userId?: string) => Effect.Effect<void, Conflict | DbError>;
  create: (params: ScanParams, repoId: string, nowMs: number) => Effect.Effect<void, DbError | Conflict>;
  mark: (accountId: string, scanId: string, patch: ScanPatch) => Effect.Effect<void, DbError>;
  addFiles: (accountId: string, scanId: string, files: NewScanFile[]) => Effect.Effect<void, DbError>;
  list: (accountId: string, limit: number, cursor?: string, filter?: ScanFilter) => Effect.Effect<ScanPage, DbError>;
  get: (accountId: string, scanId: string) => Effect.Effect<ScanStatus | null, DbError>;
  activeSince: (accountId: string, nowMs: number) => Effect.Effect<ScanStatus[], DbError>;
  file: (accountId: string, scanId: string, name: string) => Effect.Effect<ScanFileRef | null, DbError>;
};

// -----
// The reads a route makes as one Account, inside withTenant.
// -----
export type ScanReads = Pick<ScanRepo, "list" | "get" | "file">;
