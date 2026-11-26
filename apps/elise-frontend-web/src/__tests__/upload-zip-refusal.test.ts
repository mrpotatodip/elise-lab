import { describe, expect, it } from "vitest";
import { uploadRefusalOf } from "#/providers/upload/utils/upload-zip-refusal";

// -----
// A stored zip (no compression) of the given files, built by
// hand: local headers, the central directory and its end record.
// Only the fields the check reads are filled in.
// -----
const u16 = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
const u32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];

const zipOf = (files: readonly { name: string; size: number }[]): Uint8Array => {
  const encoder = new TextEncoder();
  const locals: number[] = [];
  const central: number[] = [];
  for (const file of files) {
    const name = [...encoder.encode(file.name)];
    const offset = locals.length;
    locals.push(...u32(0x04034b50), ...Array.from({ length: 22 }, () => 0), ...u16(name.length), ...u16(0), ...name);
    central.push(
      ...u32(0x02014b50),
      ...Array.from({ length: 20 }, () => 0),
      ...u32(file.size),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...Array.from({ length: 8 }, () => 0),
      ...u32(offset),
      ...name,
    );
  }
  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(central.length),
    ...u32(locals.length),
    ...u16(0),
  ];
  return new Uint8Array([...locals, ...central, ...end]);
};

const MB = 1024 * 1024;
const small = zipOf([{ name: "app/src/index.ts", size: 120 }]);
const deep = zipOf([{ name: `${Array.from({ length: 21 }, (_, at) => `d${at}`).join("/")}.ts`, size: 1 }]);
const huge = zipOf([
  { name: "a.bin", size: 200 * MB },
  { name: "b.bin", size: 60 * MB },
]);
const many = zipOf(Array.from({ length: 20_001 }, (_, at) => ({ name: `f${at}`, size: 0 })));

describe("uploadRefusalOf", () => {
  it.each([
    [
      "a zip within every limit",
      { name: "app-1.2.zip", sizeBytes: small.byteLength, bytes: small, zipsInApp: 3 },
      null,
    ],
    [
      "a file that is not a .zip",
      { name: "app.tar.gz", sizeBytes: small.byteLength, bytes: small, zipsInApp: 0 },
      "Upload a .zip file",
    ],
    [
      "bytes that are not a zip",
      { name: "app.zip", sizeBytes: 4, bytes: new Uint8Array([1, 2, 3, 4]), zipsInApp: 0 },
      "The file is not a zip",
    ],
    [
      "a zip over 50 MB",
      { name: "app.zip", sizeBytes: 50 * MB + 1, bytes: small, zipsInApp: 0 },
      "A zip can be at most 50 MB",
    ],
    [
      "a 21st zip in the app",
      { name: "app.zip", sizeBytes: small.byteLength, bytes: small, zipsInApp: 20 },
      "An upload app can hold at most 20 zips: remove one first",
    ],
    [
      "a zip of more than 20,000 files",
      { name: "app.zip", sizeBytes: many.byteLength, bytes: many, zipsInApp: 0 },
      "A zip can hold at most 20,000 files",
    ],
    [
      "a path deeper than 20 levels",
      { name: "app.zip", sizeBytes: deep.byteLength, bytes: deep, zipsInApp: 0 },
      "A path in a zip can be at most 20 levels deep",
    ],
    [
      "a zip that unpacks to more than 250 MB",
      { name: "app.zip", sizeBytes: huge.byteLength, bytes: huge, zipsInApp: 0 },
      "A zip can unpack to at most 250 MB",
    ],
  ])("answers %s", (_, upload, refusal) => {
    expect(uploadRefusalOf(upload)).toBe(refusal);
  });
});
