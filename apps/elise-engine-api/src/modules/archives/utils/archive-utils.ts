// -----
// Where a zip's bytes sit in R2: under the Account, then the
// app, so the Account's prefix check holds and removing an app
// can find every zip of it.
// -----
export const archivePrefixOf = (accountId: string, repoId: string): string => `accounts/${accountId}/uploads/${repoId}/`;

export const archiveKeyOf = (accountId: string, repoId: string, archiveId: string): string => `${archivePrefixOf(accountId, repoId)}${archiveId}.zip`;

// -----
// A zip starts with a local file header, PK\3\4. An empty zip
// (only the end record) holds no code, so it is not one here.
// -----
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export const isZip = (bytes: Uint8Array): boolean => ZIP_MAGIC.every((byte, index) => bytes[index] === byte);

// -----
// What a zip says it holds, read from its central directory
// without unpacking anything: the number of files, the bytes
// they unpack to and the deepest path (in parts, so a/b.ts is 2).
// Zip64 sizes and counts are read too. null when the directory
// is not where the end record says, so the bytes are not a zip.
// The sizes are the zip's own claim: the Runner holds the
// unpacked limits again while it unpacks.
// -----
export type ZipContents = { files: number; unpackedBytes: number; deepestPath: number };

const END_SIG = 0x06054b50;
const END64_LOCATOR_SIG = 0x07064b50;
const END64_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const ZIP64_EXTRA = 0x0001;
const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;
const END_SIZE = 22;
const CENTRAL_SIZE = 46;

const pathDepthOf = (name: string): number => name.split(/[/\\]/).filter((part) => part.length > 0).length;

export const zipContentsOf = (bytes: Uint8Array): ZipContents | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fits = (at: number, size: number) => at >= 0 && at + size <= bytes.byteLength;
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  const u64 = (at: number) => u32(at + 4) * 2 ** 32 + u32(at);

  let end = -1;
  for (let at = bytes.byteLength - END_SIZE; at >= Math.max(0, bytes.byteLength - END_SIZE - U16_MAX); at -= 1) {
    if (u32(at) === END_SIG) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;
  let entries = u16(end + 10);
  let offset = u32(end + 16);
  if (entries === U16_MAX || offset === U32_MAX) {
    const locator = end - 20;
    if (!fits(locator, 20) || u32(locator) !== END64_LOCATOR_SIG) return null;
    const end64 = u64(locator + 8);
    if (!fits(end64, 56) || u32(end64) !== END64_SIG) return null;
    entries = u64(end64 + 32);
    offset = u64(end64 + 48);
  }

  const decoder = new TextDecoder();
  const contents: ZipContents = { files: 0, unpackedBytes: 0, deepestPath: 0 };
  let at = offset;
  for (let index = 0; index < entries; index += 1) {
    if (!fits(at, CENTRAL_SIZE) || u32(at) !== CENTRAL_SIG) return null;
    const nameLength = u16(at + 28);
    const extraLength = u16(at + 30);
    const commentLength = u16(at + 32);
    if (!fits(at + CENTRAL_SIZE, nameLength + extraLength)) return null;
    const name = decoder.decode(bytes.subarray(at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength));
    let unpacked = u32(at + 24);
    if (unpacked === U32_MAX) {
      for (let field = at + CENTRAL_SIZE + nameLength; field + 4 <= at + CENTRAL_SIZE + nameLength + extraLength; field += 4 + u16(field + 2)) {
        if (u16(field) === ZIP64_EXTRA && fits(field + 4, 8)) unpacked = u64(field + 4);
      }
    }
    if (!/[/\\]$/.test(name)) {
      contents.files += 1;
      contents.unpackedBytes += unpacked;
    }
    contents.deepestPath = Math.max(contents.deepestPath, pathDepthOf(name));
    at += CENTRAL_SIZE + nameLength + extraLength + commentLength;
  }
  return contents;
};

export const sha256HexOf = async (bytes: ArrayBuffer): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
