// -----
// A small zip built byte by byte: stored entries, each with a
// local header and a central directory record, then the end
// record. An entry may claim an unpacked size larger than its
// bytes (a zip bomb's lie), since the upload route reads only the
// central directory. CRCs are zero: nothing here unpacks.
// -----
export type ZipEntry = { name: string; text?: string; claimedSize?: number };

const u16 = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
const u32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];

export const zipOf = (entries: readonly ZipEntry[]): Uint8Array => {
  const encoder = new TextEncoder();
  const locals: number[] = [];
  const centrals: number[] = [];
  for (const entry of entries) {
    const name = [...encoder.encode(entry.name)];
    const data = [...encoder.encode(entry.text ?? "")];
    const unpacked = entry.claimedSize ?? data.length;
    const offset = locals.length;
    locals.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(data.length),
      ...u32(unpacked),
      ...u16(name.length),
      ...u16(0),
      ...name,
      ...data,
    );
    centrals.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(data.length),
      ...u32(unpacked),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name,
    );
  }
  const count = Math.min(entries.length, 0xffff);
  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(count),
    ...u16(count),
    ...u32(centrals.length),
    ...u32(locals.length),
    ...u16(0),
  ];
  return new Uint8Array([...locals, ...centrals, ...end]);
};
