import { sha256Hex } from "@repo/db-elise";
import { RUNNER_LOGIN_DEVICE_CODE_BYTES, RUNNER_TOKEN_BYTES } from "@repo/contracts/elise";
import {
  RUNNER_LOGIN_USER_CODE_LENGTH,
  RUNNER_PAIRING_ALPHABET,
  RUNNER_PAIRING_CODE_LENGTH,
  RUNNER_PAIRING_GROUP_LENGTH,
  RUNNER_TOKEN_PREFIX,
} from "#/modules/runners/constants";

// -----
// The alphabet has 32 characters, so a random byte
// modulo 32 is unbiased. The code reads as groups of
// four: XXXX-XXXX-XXXX.
// -----
const groupedCode = (length: number): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  const chars = Array.from(bytes, (byte) => RUNNER_PAIRING_ALPHABET.charAt(byte % RUNNER_PAIRING_ALPHABET.length)).join(
    "",
  );
  const groups = Array.from({ length: length / RUNNER_PAIRING_GROUP_LENGTH }, (_, i) =>
    chars.slice(i * RUNNER_PAIRING_GROUP_LENGTH, (i + 1) * RUNNER_PAIRING_GROUP_LENGTH),
  );
  return groups.join("-");
};

export const generatePairingCode = (): string => groupedCode(RUNNER_PAIRING_CODE_LENGTH);

// -----
// The code a person types on the dashboard's device page:
// 8 characters of the same alphabet, XXXX-XXXX.
// -----
export const generateUserCode = (): string => groupedCode(RUNNER_LOGIN_USER_CODE_LENGTH);

// -----
// What a person types may use lower case, spaces or no
// dash. The hash is of this form, so every spelling of
// one code finds the same row.
// -----
export const normalizePairingCode = (input: string): string => input.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const hashPairingCode = (code: string): Promise<string> => sha256Hex(normalizePairingCode(code));

// -----
// 32 random bytes as base64url. Only the hash is
// stored, so a leaked table cannot act as a Runner.
// -----
const base64UrlOf = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

export const generateRunnerToken = (): string =>
  RUNNER_TOKEN_PREFIX + base64UrlOf(crypto.getRandomValues(new Uint8Array(RUNNER_TOKEN_BYTES)));

// -----
// 32 random bytes only the Runner that started the login
// sees. Only the hash is stored.
// -----
export const generateDeviceCode = (): string =>
  base64UrlOf(crypto.getRandomValues(new Uint8Array(RUNNER_LOGIN_DEVICE_CODE_BYTES)));

export const hashDeviceCode = (code: string): Promise<string> => sha256Hex(code);

export const hashRunnerToken = (token: string): Promise<string> => sha256Hex(token);

// -----
// The token of an `Authorization: Bearer <token>`
// header, or null when the header is not that.
// -----
export const bearerTokenOf = (header: string | undefined): string | null => {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
};
