const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SEALED_MARKER = "sealed:v1:";
export const SEALED_OBJECT_KEY = "sealed";
export const SEALED_OBJECT_VERSION = "v1";

export type DataKey = { enc: CryptoKey; mac: CryptoKey };

const BASE64_CHUNK = 0x8000;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK));
  }
  return btoa(binary);
};
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const toHex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const isSealed = (value: string): boolean => value.startsWith(SEALED_MARKER);

export const newDataKey = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(32));

export const parseMasterKey = async (secret: string): Promise<CryptoKey | null> => {
  try {
    const raw = fromBase64(secret.trim());
    if (raw.length !== 32) return null;
    return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
};

export const wrapDataKey = async (
  master: CryptoKey,
  accountId: string,
  raw: Uint8Array<ArrayBuffer>,
): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(accountId) },
    master,
    raw,
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(wrapped))}`;
};

const importDataKey = async (raw: Uint8Array<ArrayBuffer>): Promise<DataKey> => {
  const enc = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  const mac = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encoder.encode("fingerprint") },
    base,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  return { enc, mac };
};

export const unwrapDataKey = async (master: CryptoKey, accountId: string, wrapped: string): Promise<DataKey | null> => {
  const [iv, data] = wrapped.split(".");
  if (iv === undefined || data === undefined) return null;
  try {
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv), additionalData: encoder.encode(accountId) },
      master,
      fromBase64(data),
    );
    return await importDataKey(new Uint8Array(raw));
  } catch {
    return null;
  }
};

export const makeDataKey = async (
  master: CryptoKey,
  accountId: string,
): Promise<{ wrapped: string; dataKey: DataKey }> => {
  const raw = newDataKey();
  return { wrapped: await wrapDataKey(master, accountId, raw), dataKey: await importDataKey(raw) };
};

export const sealText = async (key: DataKey, accountId: string, text: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(accountId) },
    key.enc,
    encoder.encode(text),
  );
  return `${SEALED_MARKER}${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
};

export const openText = async (key: DataKey, accountId: string, value: string): Promise<string | null> => {
  if (!isSealed(value)) return null;
  const [iv, data] = value.slice(SEALED_MARKER.length).split(".");
  if (iv === undefined || data === undefined) return null;
  try {
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv), additionalData: encoder.encode(accountId) },
      key.enc,
      fromBase64(data),
    );
    return decoder.decode(opened);
  } catch {
    return null;
  }
};

export const sealBytes = async (key: DataKey, accountId: string, bytes: BufferSource): Promise<ArrayBuffer> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(accountId) },
    key.enc,
    bytes,
  );
  const joined = new Uint8Array(iv.length + sealed.byteLength);
  joined.set(iv);
  joined.set(new Uint8Array(sealed), iv.length);
  return joined.buffer;
};

export const openBytes = async (key: DataKey, accountId: string, bytes: ArrayBuffer): Promise<ArrayBuffer | null> => {
  if (bytes.byteLength <= 12) return null;
  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(bytes, 0, 12), additionalData: encoder.encode(accountId) },
      key.enc,
      new Uint8Array(bytes, 12),
    );
  } catch {
    return null;
  }
};

export const fingerprintHmac = async (key: DataKey, text: string): Promise<string> =>
  toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key.mac, encoder.encode(text))));
