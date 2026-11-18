import { Effect } from "effect";
import { toExternalError, type ExternalError } from "#/lib/effect-query";

export type StoredObject = { key: string; uploaded: Date };

// -----
// R2 deletes at most 1000 keys in one call.
// -----
const R2_DELETE_BATCH = 1000;

// -----
// Every object under a prefix, page by page.
// -----
export const listObjectsEffect = (reports: R2Bucket, prefix: string): Effect.Effect<StoredObject[], ExternalError> =>
  Effect.tryPromise({
    try: async () => {
      const found: StoredObject[] = [];
      let cursor: string | undefined;
      do {
        const page = await reports.list({ prefix, cursor });
        found.push(...page.objects.map((object) => ({ key: object.key, uploaded: object.uploaded })));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor !== undefined);
      return found;
    },
    catch: toExternalError,
  });

export const deleteObjectsEffect = (reports: R2Bucket, keys: readonly string[]): Effect.Effect<void, ExternalError> =>
  Effect.forEach(
    Array.from({ length: Math.ceil(keys.length / R2_DELETE_BATCH) }, (_, index) => keys.slice(index * R2_DELETE_BATCH, (index + 1) * R2_DELETE_BATCH)),
    (batch) => Effect.tryPromise({ try: () => reports.delete(batch), catch: toExternalError }),
    { discard: true },
  );
