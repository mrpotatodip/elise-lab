import {
  UPLOAD_ARCHIVE_MAX_MB,
  UPLOAD_ARCHIVE_TOO_LARGE_MESSAGE,
  UPLOAD_ARCHIVES_PER_APP_MAX,
  UPLOAD_FILES_MAX,
  UPLOAD_NOT_A_ZIP_MESSAGE,
  UPLOAD_PATH_DEPTH_MAX,
  UPLOAD_PATH_TOO_DEEP_MESSAGE,
  UPLOAD_TOO_MANY_ARCHIVES_MESSAGE,
  UPLOAD_TOO_MANY_FILES_MESSAGE,
  UPLOAD_UNPACKED_MAX_MB,
  UPLOAD_UNPACKED_TOO_LARGE_MESSAGE,
} from "@repo/contracts/elise";

const MB = 1024 * 1024;

export const UPLOAD_NOT_A_ZIP_FILE = "Upload a .zip file";

// -----
// What a zip says it holds, read from its central directory
// without unpacking anything: the number of files, the bytes
// they unpack to and the deepest path, in parts. Zip64 counts
// and sizes are read too. null when the bytes are not a zip.
// A twin of the engine's zipContentsOf: the engine checks the
// same limits again, and the Runner while it unpacks.
// -----
type ZipContents = { files: number; unpackedBytes: number; deepestPath: number };

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
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

function zipContentsOf(bytes: Uint8Array): ZipContents | null {
  if (!ZIP_MAGIC.every((byte, index) => bytes[index] === byte)) return null;
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
      for (
        let field = at + CENTRAL_SIZE + nameLength;
        field + 4 <= at + CENTRAL_SIZE + nameLength + extraLength;
        field += 4 + u16(field + 2)
      ) {
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
}

export type UploadCandidate = { name: string; sizeBytes: number; bytes: Uint8Array; zipsInApp: number };

// -----
// Why a zip would be refused, in the engine's words, or null.
// Checked before the zip is sent, so an over-limit file never
// leaves the browser. The Account's 500 MB of stored zips is
// the engine's to check: only it sees every app.
// -----
export function uploadRefusalOf(upload: UploadCandidate): string | null {
  if (!upload.name.toLowerCase().endsWith(".zip")) return UPLOAD_NOT_A_ZIP_FILE;
  if (upload.sizeBytes > UPLOAD_ARCHIVE_MAX_MB * MB) return UPLOAD_ARCHIVE_TOO_LARGE_MESSAGE;
  if (upload.zipsInApp >= UPLOAD_ARCHIVES_PER_APP_MAX) return UPLOAD_TOO_MANY_ARCHIVES_MESSAGE;
  const contents = zipContentsOf(upload.bytes);
  if (contents === null) return UPLOAD_NOT_A_ZIP_MESSAGE;
  if (contents.files > UPLOAD_FILES_MAX) return UPLOAD_TOO_MANY_FILES_MESSAGE;
  if (contents.deepestPath > UPLOAD_PATH_DEPTH_MAX) return UPLOAD_PATH_TOO_DEEP_MESSAGE;
  if (contents.unpackedBytes > UPLOAD_UNPACKED_MAX_MB * MB) return UPLOAD_UNPACKED_TOO_LARGE_MESSAGE;
  return null;
}
