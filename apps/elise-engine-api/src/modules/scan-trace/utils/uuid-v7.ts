// -----
// A UUIDv7: 48 bits of milliseconds, then a 12-bit sequence in the
// field that follows the version, then random bits. Two ids made in the
// same millisecond with a rising sequence sort in the order made. A
// sequence past 4095 carries into the millisecond field, so order holds.
// -----
export const uuidV7 = (ms: number, seq: number): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const time = BigInt(ms + Math.floor(seq / 4096));
  const low = seq % 4096;
  for (let i = 0; i < 6; i++) bytes[i] = Number((time >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = 0x70 | ((low >> 8) & 0x0f);
  bytes[7] = low & 0xff;
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
