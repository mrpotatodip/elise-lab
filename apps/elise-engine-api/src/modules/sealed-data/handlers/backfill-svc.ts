import { Effect } from "effect";
import type { TenantDbType } from "#/lib/db-connection";
import { toExternalError, type DbError, type ExternalError } from "#/lib/effect-query";
import {
  fingerprintPairsEffect,
  objectKeysEffect,
  pendingRowsEffect,
  updateRowEffect,
  type ColumnChange,
  type PendingRow,
} from "#/modules/sealed-data/queries";
import {
  BACKFILL_OBJECT_TABLES,
  BACKFILL_STEPS,
  CANNOT_READ,
  SEALED_OBJECT_METADATA,
  UNMAPPED_HMAC,
  isSealed,
  type BackfillStep,
  type Sealer,
} from "#/modules/sealed-data/utils";
import { sealerEffect } from "./sealer";

export type BackfillDeps = {
  listAccounts: Effect.Effect<string[], DbError>;
  inAccount: <A, E>(
    accountId: string,
    make: (db: TenantDbType) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E | DbError>;
  reports: Pick<R2Bucket, "head" | "get" | "put">;
  masterKey: string | undefined;
  onBatch?: (line: string) => void;
};

export type BackfillOptions = {
  batchSize: number;
  dry: boolean;
  maxBatches?: number | undefined;
  accountId?: string | undefined;
};

export type BackfillSummary = {
  accounts: number;
  rows: number;
  objects: number;
  unmapped: number;
  failed: number;
  missing: number;
  batches: number;
  stopped: boolean;
};

type Failure = DbError | ExternalError;
type SealerSource = Effect.Effect<Sealer, Failure>;
type RowUpdate = { keys: string[]; changes: ColumnChange[]; hmac: string | null };

const needsSealer = (step: BackfillStep, row: PendingRow): boolean =>
  step.fingerprint === "own" || row.cols.some((value) => value !== null && !isSealed(value));

const planRowEffect = (
  step: BackfillStep,
  row: PendingRow,
  getSealer: SealerSource,
  pairs: ReadonlyMap<string, string>,
  state: BackfillSummary,
): Effect.Effect<RowUpdate | null, Failure> =>
  Effect.gen(function* () {
    const sealer = needsSealer(step, row) ? yield* getSealer : null;
    const changes = yield* Effect.tryPromise({
      try: async () => {
        const made: ColumnChange[] = [];
        for (const [index, column] of step.columns.entries()) {
          const value = row.cols[index];
          if (sealer === null || value === null || value === undefined || isSealed(value)) continue;
          made.push({ column: column.name, from: value, to: await sealer.text(value) });
        }
        return made;
      },
      catch: toExternalError,
    });
    const hmac = yield* hmacOfEffect(step, row, sealer, pairs);
    if (step.fingerprint === "own" && hmac === null) {
      state.failed += 1;
      return null;
    }
    if (step.fingerprint === "mapped" && hmac === null) {
      state.unmapped += 1;
      return { keys: row.keys, changes, hmac: UNMAPPED_HMAC };
    }
    return changes.length === 0 && hmac === null ? null : { keys: row.keys, changes, hmac };
  });

const hmacOfEffect = (
  step: BackfillStep,
  row: PendingRow,
  sealer: Sealer | null,
  pairs: ReadonlyMap<string, string>,
): Effect.Effect<string | null, ExternalError> =>
  Effect.tryPromise({
    try: async () => {
      if (step.fingerprint === "mapped") return pairs.get(row.fingerprint ?? "") ?? null;
      if (step.fingerprint !== "own" || sealer === null) return null;
      const id = await sealer.open.text(row.cols[0] ?? "");
      return id === CANNOT_READ ? null : sealer.fingerprint(id);
    },
    catch: toExternalError,
  });

const stepEffect = (
  deps: BackfillDeps,
  options: BackfillOptions,
  state: BackfillSummary,
  accountId: string,
  step: BackfillStep,
  getSealer: SealerSource,
): Effect.Effect<void, Failure> =>
  Effect.gen(function* () {
    const pairs =
      step.fingerprint === "mapped" && !options.dry
        ? yield* deps.inAccount(accountId, (db) => fingerprintPairsEffect(db, accountId))
        : new Map<string, string>();
    let last: string[] | null = null;
    while (true) {
      const rows: PendingRow[] = yield* deps.inAccount(accountId, (db) =>
        pendingRowsEffect(db, accountId, step, last, options.batchSize),
      );
      if (rows.length === 0) return;
      if (options.maxBatches !== undefined && state.batches >= options.maxBatches) {
        state.stopped = true;
        return;
      }
      state.batches += 1;
      last = rows[rows.length - 1].keys;
      if (options.dry) {
        state.rows += rows.length;
      } else {
        const planned: RowUpdate[] = [];
        for (const row of rows) {
          const plan = yield* planRowEffect(step, row, getSealer, pairs, state);
          if (plan !== null) planned.push(plan);
        }
        const done = yield* deps.inAccount(accountId, (db) =>
          Effect.forEach(planned, (plan) => updateRowEffect(db, accountId, step, plan.keys, plan.changes, plan.hmac)),
        );
        state.rows += done.filter(Boolean).length;
      }
      deps.onBatch?.(`${accountId} ${step.table} ${rows.length} rows`);
      if (rows.length < options.batchSize) return;
    }
  });

const sealObjectEffect = (
  deps: BackfillDeps,
  options: BackfillOptions,
  state: BackfillSummary,
  getSealer: SealerSource,
  key: string,
): Effect.Effect<void, Failure> =>
  Effect.gen(function* () {
    const head = yield* Effect.tryPromise({ try: () => deps.reports.head(key), catch: toExternalError });
    if (head === null) {
      state.missing += 1;
      return;
    }
    if (head.customMetadata?.sealed === SEALED_OBJECT_METADATA.sealed) return;
    if (options.dry) {
      state.objects += 1;
      return;
    }
    const sealer = yield* getSealer;
    yield* Effect.tryPromise({
      try: async () => {
        const object = await deps.reports.get(key);
        if (object === null) return;
        const sealed = await sealer.bytes(await object.arrayBuffer());
        await deps.reports.put(key, sealed, {
          customMetadata: { ...object.customMetadata, ...SEALED_OBJECT_METADATA },
          httpMetadata: object.httpMetadata,
        });
        state.objects += 1;
      },
      catch: toExternalError,
    });
  });

const objectStepEffect = (
  deps: BackfillDeps,
  options: BackfillOptions,
  state: BackfillSummary,
  accountId: string,
  table: string,
  getSealer: SealerSource,
): Effect.Effect<void, Failure> =>
  Effect.gen(function* () {
    let last: string | null = null;
    while (true) {
      const keys: string[] = yield* deps.inAccount(accountId, (db) =>
        objectKeysEffect(db, accountId, table, last, options.batchSize),
      );
      if (keys.length === 0) return;
      const before = state.objects;
      yield* Effect.forEach(keys, (key) => sealObjectEffect(deps, options, state, getSealer, key), { discard: true });
      last = keys[keys.length - 1];
      if (state.objects > before) {
        if (options.maxBatches !== undefined && state.batches >= options.maxBatches) {
          state.stopped = true;
          return;
        }
        state.batches += 1;
        deps.onBatch?.(`${accountId} ${table} objects ${state.objects - before}`);
      }
      if (keys.length < options.batchSize) return;
    }
  });

const accountEffect = (
  deps: BackfillDeps,
  options: BackfillOptions,
  state: BackfillSummary,
  accountId: string,
): Effect.Effect<void, Failure> => {
  let held: Sealer | null = null;
  const getSealer: SealerSource = Effect.suspend(() =>
    held !== null
      ? Effect.succeed(held)
      : deps
          .inAccount(accountId, (db) => sealerEffect(db, deps.masterKey, accountId))
          .pipe(Effect.tap((sealer) => Effect.sync(() => void (held = sealer)))),
  );
  return Effect.gen(function* () {
    for (const step of BACKFILL_STEPS) {
      if (state.stopped) return;
      yield* stepEffect(deps, options, state, accountId, step, getSealer);
    }
    for (const table of BACKFILL_OBJECT_TABLES) {
      if (state.stopped) return;
      yield* objectStepEffect(deps, options, state, accountId, table, getSealer);
    }
  });
};

export const sealBackfillEffect = (
  deps: BackfillDeps,
  options: BackfillOptions,
): Effect.Effect<BackfillSummary, Failure> =>
  Effect.gen(function* () {
    const state: BackfillSummary = {
      accounts: 0,
      rows: 0,
      objects: 0,
      unmapped: 0,
      failed: 0,
      missing: 0,
      batches: 0,
      stopped: false,
    };
    const listed = yield* deps.listAccounts;
    const accounts = options.accountId === undefined ? listed : listed.filter((id) => id === options.accountId);
    for (const accountId of accounts) {
      if (state.stopped) break;
      state.accounts += 1;
      yield* accountEffect(deps, options, state, accountId);
    }
    return state;
  });
