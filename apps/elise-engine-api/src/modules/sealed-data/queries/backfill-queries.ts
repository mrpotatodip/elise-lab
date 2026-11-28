import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import type { TenantDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { SEALED_MARKER, type BackfillStep } from "#/modules/sealed-data/utils";

const PendingRowsSchema = z.object({
  rows: z.array(
    z.object({
      keys: z.array(z.string()),
      cols: z.array(z.string().nullable()),
      fp: z.string().nullable(),
    }),
  ),
});
const ObjectKeysSchema = z.object({ rows: z.array(z.object({ key: z.string() })) });
const FingerprintPairsSchema = z.object({ rows: z.array(z.object({ fp: z.string(), hmac: z.string() })) });
const UpdatedSchema = z.object({ rows: z.array(z.object({ ok: z.number() })) });

export type PendingRow = { keys: string[]; cols: (string | null)[]; fingerprint: string | null };
export type ColumnChange = { column: string; from: string | null; to: string };

const ident = (name: string) => sql.identifier(name);
const textOf = (names: readonly string[]) =>
  sql.join(
    names.map((name) => sql`${ident(name)}::text`),
    sql`, `,
  );
const after = (keys: readonly string[], last: readonly string[] | null) =>
  last === null
    ? sql`true`
    : sql`(${textOf(keys)}) > (${sql.join(
        last.map((value) => sql`${value}`),
        sql`, `,
      )})`;

const unsealed = (name: string, unless: string | undefined) =>
  sql`(${ident(name)} is not null and ${ident(name)} not like ${`${SEALED_MARKER}%`}${unless === undefined ? sql`` : sql` and not (${sql.raw(unless)})`})`;

export const pendingRowsEffect = (
  db: TenantDbType,
  tenantId: string,
  step: BackfillStep,
  last: readonly string[] | null,
  limit: number,
): Effect.Effect<PendingRow[], DbError> => {
  const pending = [
    ...step.columns.map((column) => unsealed(column.name, column.unless)),
    ...(step.fingerprint === null ? [] : [sql`${ident("fingerprint_hmac")} is null`]),
  ];
  const fingerprint = step.fingerprint === null ? sql`null::text` : sql`${ident("fingerprint")}::text`;
  const cols =
    step.columns.length === 0
      ? sql`'[]'::jsonb`
      : sql`jsonb_build_array(${sql.join(
          step.columns.map((column) =>
            column.unless === undefined
              ? ident(column.name)
              : sql`case when ${sql.raw(column.unless)} then null else ${ident(column.name)} end`,
          ),
          sql`, `,
        )})`;
  return Effect.tryPromise({
    try: async () =>
      PendingRowsSchema.parse(
        await db.execute(sql`
          select jsonb_build_array(${textOf(step.keys)}) as keys, ${cols} as cols, ${fingerprint} as fp
          from ${ident(step.table)}
          where tenant_id = ${tenantId}::uuid and (${sql.join(pending, sql` or `)}) and ${after(step.keys, last)}
          order by ${textOf(step.keys)}
          limit ${limit}
        `),
      ).rows.map((row) => ({ keys: row.keys, cols: row.cols, fingerprint: row.fp })),
    catch: toDbError,
  });
};

export const updateRowEffect = (
  db: TenantDbType,
  tenantId: string,
  step: BackfillStep,
  keys: readonly string[],
  changes: readonly ColumnChange[],
  hmac: string | null,
): Effect.Effect<boolean, DbError> => {
  const set = [
    ...changes.map((change) => sql`${ident(change.column)} = ${change.to}`),
    ...(hmac === null ? [] : [sql`${ident("fingerprint_hmac")} = ${hmac}`]),
  ];
  const sameKeys = step.keys.map((key, index) => sql`${ident(key)}::text = ${keys[index]}`);
  const sameValues = changes.map((change) => sql`${ident(change.column)} is not distinct from ${change.from}`);
  return Effect.tryPromise({
    try: async () =>
      UpdatedSchema.parse(
        await db.execute(sql`
          update ${ident(step.table)} set ${sql.join(set, sql`, `)}
          where tenant_id = ${tenantId}::uuid and ${sql.join([...sameKeys, ...sameValues], sql` and `)}
          returning 1 as ok
        `),
      ).rows.length === 1,
    catch: toDbError,
  });
};

export const fingerprintPairsEffect = (
  db: TenantDbType,
  tenantId: string,
): Effect.Effect<Map<string, string>, DbError> =>
  Effect.tryPromise({
    try: async () =>
      new Map(
        FingerprintPairsSchema.parse(
          await db.execute(sql`
            select distinct fingerprint as fp, fingerprint_hmac as hmac
            from scan_findings
            where tenant_id = ${tenantId}::uuid and fingerprint_hmac is not null
          `),
        ).rows.map((row) => [row.fp, row.hmac]),
      ),
    catch: toDbError,
  });

export const objectKeysEffect = (
  db: TenantDbType,
  tenantId: string,
  table: string,
  last: string | null,
  limit: number,
): Effect.Effect<string[], DbError> =>
  Effect.tryPromise({
    try: async () =>
      ObjectKeysSchema.parse(
        await db.execute(sql`
          select r2_key as key from ${ident(table)}
          where tenant_id = ${tenantId}::uuid and ${last === null ? sql`true` : sql`r2_key > ${last}`}
          order by r2_key
          limit ${limit}
        `),
      ).rows.map((row) => row.key),
    catch: toDbError,
  });
