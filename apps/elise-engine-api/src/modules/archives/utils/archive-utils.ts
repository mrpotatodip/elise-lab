// -----
// Where a zip's bytes sit in R2: under the Account, then the
// app, so the Account's prefix check holds and removing an app
// can find every zip of it.
// -----
export const archiveKeyOf = (accountId: string, repoId: string, archiveId: string): string => `accounts/${accountId}/uploads/${repoId}/${archiveId}.zip`;

// -----
// A zip starts with a local file header, PK\3\4. An empty zip
// (only the end record) holds no code, so it is not one here.
// -----
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export const isZip = (bytes: Uint8Array): boolean => ZIP_MAGIC.every((byte, index) => bytes[index] === byte);

export const sha256HexOf = async (bytes: ArrayBuffer): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
