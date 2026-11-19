// -----
// A UUIDv7: 48 bits of milliseconds, then a 12-bit sequence in the
// field that follows the version, then random bits. Two ids made in the
// same millisecond with a rising sequence sort in the order made.
// -----
export const uuidV7 = (ms: number, seq: number): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const time = BigInt(ms);
  for (let i = 0; i < 6; i++) bytes[i] = Number((time >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = 0x70 | ((seq >> 8) & 0x0f);
  bytes[7] = seq & 0xff;
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
