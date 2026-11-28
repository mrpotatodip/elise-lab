import { describe, expect, it } from "vitest";
import {
  fingerprintHmac,
  isSealed,
  newDataKey,
  openText,
  parseMasterKey,
  sealText,
  unwrapDataKey,
  wrapDataKey,
} from "#/modules/sealed-data/utils";

const MASTER = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const OTHER_MASTER = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

const keyOf = async () => {
  const master = await parseMasterKey(MASTER);
  if (!master) throw new Error("master key must parse");
  const raw = newDataKey();
  const wrapped = await wrapDataKey(master, "acme", raw);
  const dataKey = await unwrapDataKey(master, "acme", wrapped);
  if (!dataKey) throw new Error("data key must unwrap");
  return { master, wrapped, dataKey };
};

describe("parseMasterKey", () => {
  it.each([
    ["not base64", "!!!"],
    ["too short", btoa("short")],
    ["empty", ""],
  ])("refuses a master key that is %s", async (_name, secret) => {
    expect(await parseMasterKey(secret)).toBeNull();
  });
});

describe("wrapDataKey and unwrapDataKey", () => {
  it("opens, with the master key, a Data key it locked for the same Account", async () => {
    const { dataKey } = await keyOf();

    expect(await openText(dataKey, "acme", await sealText(dataKey, "acme", "hello"))).toBe("hello");
  });

  it("does not unwrap for another Account or with another master key", async () => {
    const { master, wrapped } = await keyOf();
    const other = await parseMasterKey(OTHER_MASTER);

    expect(await unwrapDataKey(master, "other", wrapped)).toBeNull();
    expect(other && (await unwrapDataKey(other, "acme", wrapped))).toBeNull();
  });

  it("does not hold the Data key in the clear", async () => {
    const master = await parseMasterKey(MASTER);
    const raw = new Uint8Array(32).fill(65);
    const wrapped = await wrapDataKey(master!, "acme", raw);

    expect(wrapped).not.toContain("QUFB");
  });
});

describe("sealText and openText", () => {
  it("marks the sealed value and hides the text", async () => {
    const { dataKey } = await keyOf();
    const sealed = await sealText(dataKey, "acme", "SQL injection in login.ts");

    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("injection");
  });

  it("seals the same text to different values each time", async () => {
    const { dataKey } = await keyOf();

    expect(await sealText(dataKey, "acme", "x")).not.toBe(await sealText(dataKey, "acme", "x"));
  });

  it("does not open as another Account, so a copied value stays shut", async () => {
    const { dataKey } = await keyOf();
    const sealed = await sealText(dataKey, "acme", "secret");

    expect(await openText(dataKey, "other", sealed)).toBeNull();
  });

  it.each([
    ["no dot", "sealed:v1:garbage"],
    ["damaged data", "sealed:v1:AAAA.AAAA"],
    ["plain text", "just a title"],
  ])("does not open %s", async (_name, value) => {
    const { dataKey } = await keyOf();

    expect(await openText(dataKey, "acme", value)).toBeNull();
  });

  it("tells plain text from a sealed value by the marker", () => {
    expect(isSealed("SQL injection")).toBe(false);
    expect(isSealed("sealed:v1:abc.def")).toBe(true);
  });
});

describe("fingerprintHmac", () => {
  it("gives the same value for the same text and Data key", async () => {
    const { dataKey } = await keyOf();

    expect(await fingerprintHmac(dataKey, "authz|a.ts|title")).toBe(await fingerprintHmac(dataKey, "authz|a.ts|title"));
  });

  it("differs for another text and for another Data key", async () => {
    const first = await keyOf();
    const second = await keyOf();

    expect(await fingerprintHmac(first.dataKey, "a")).not.toBe(await fingerprintHmac(first.dataKey, "b"));
    expect(await fingerprintHmac(first.dataKey, "a")).not.toBe(await fingerprintHmac(second.dataKey, "a"));
  });

  it("is 64 hex characters, like the fingerprint it replaces", async () => {
    const { dataKey } = await keyOf();

    expect(await fingerprintHmac(dataKey, "a")).toMatch(/^[0-9a-f]{64}$/);
  });
});
