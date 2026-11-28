import { tenantDataKeys } from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATA_MASTER_KEY } from "#/__tests__/fake-bindings";
import { asTenant, openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { ensureDataKeyEffect, makeUnsealer, sealText, unsealerEffect } from "#/modules/sealed-data";

let test: TestDb;
let acme: string;
let other: string;

beforeAll(async () => {
  test = await openTestDb();
  acme = (await seedTenant(test, "acme")).tenantId;
  other = (await seedTenant(test, "other")).tenantId;
});

afterAll(async () => {
  await test.close();
});

const rowsOf = (tenantId: string) =>
  test.raw.select().from(tenantDataKeys).where(eq(tenantDataKeys.tenantId, tenantId));

describe("ensureDataKeyEffect", () => {
  it("makes one key for an Account when two Scans ask together, and both get the same key", async () => {
    const [first, second] = await Promise.all([
      Effect.runPromise(ensureDataKeyEffect(test.pool, TEST_DATA_MASTER_KEY, acme)),
      Effect.runPromise(ensureDataKeyEffect(test.pool, TEST_DATA_MASTER_KEY, acme)),
    ]);
    const sealed = await sealText(first, acme, "shared");

    expect(await rowsOf(acme)).toHaveLength(1);
    expect(await makeUnsealer(second, acme).text(sealed)).toBe("shared");
  });

  it("finds the key it made earlier and does not make another", async () => {
    const before = await rowsOf(acme);
    await Effect.runPromise(ensureDataKeyEffect(test.pool, TEST_DATA_MASTER_KEY, acme));

    expect(await rowsOf(acme)).toEqual(before);
  });

  it("stores the key locked: the row does not hold a usable key without the master key", async () => {
    const [row] = await rowsOf(acme);
    const unsealer = await Effect.runPromise(unsealerEffect(test.pool, "AAAA", acme));
    const sealed = await sealText(
      await Effect.runPromise(ensureDataKeyEffect(test.pool, TEST_DATA_MASTER_KEY, acme)),
      acme,
      "x",
    );

    expect(row.wrappedKey).not.toBe("");
    expect(await unsealer.text(sealed)).toBe("cannot be read");
  });

  it("fails without a master key and makes no row", async () => {
    const failure = await Effect.runPromise(Effect.flip(ensureDataKeyEffect(test.pool, undefined, other)));

    expect([failure._tag, await rowsOf(other)]).toEqual(["DataKeyUnavailable", []]);
  });

  it("is not readable by another Account's session", async () => {
    const seen = await asTenant(test, other, (db) => db.select().from(tenantDataKeys));

    expect(seen).toEqual([]);
  });
});
