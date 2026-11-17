// -----
// The hex SHA-256 of the UTF-8 text. A stored finding fingerprint
// and every triage decision keyed by it depend on this, so it
// stays here and does not move with other helpers.
// -----
export const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
