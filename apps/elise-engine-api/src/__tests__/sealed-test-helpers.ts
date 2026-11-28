import { tenantDataKeys } from "@repo/db-elise/schema";
import { TEST_DATA_MASTER_KEY } from "#/__tests__/fake-bindings";
import type { TestDb } from "#/__tests__/test-db";
import { makeDataKey, parseMasterKey, sealBytes, sealText } from "#/modules/sealed-data/utils";

// -----
// Gives an Account a Data key under the test master key and returns
// what seals text (and, as .bytes, a file) for it, so a test can
// store sealed values the way the write step will.
// -----
export const giveDataKey = async (test: TestDb, tenantId: string) => {
  const master = await parseMasterKey(TEST_DATA_MASTER_KEY);
  if (!master) throw new Error("the test master key must parse");
  const { wrapped, dataKey } = await makeDataKey(master, tenantId);
  await test.raw.insert(tenantDataKeys).values({ tenantId, wrappedKey: wrapped });
  return Object.assign((text: string) => sealText(dataKey, tenantId, text), {
    bytes: (bytes: ArrayBuffer) => sealBytes(dataKey, tenantId, bytes),
  });
};
