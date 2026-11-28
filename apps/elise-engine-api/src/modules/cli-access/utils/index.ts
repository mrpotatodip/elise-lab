import { sha256Hex } from "@repo/db-elise";
import { CLI_ACCESS_TOKEN_BYTES, type AccessPower, type CliAccessScope } from "@repo/contracts/elise";
import { CLI_ACCESS_TOKEN_PREFIX } from "#/modules/cli-access/constants";

const base64UrlOf = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

export const generateCliAccessToken = (): string =>
  CLI_ACCESS_TOKEN_PREFIX + base64UrlOf(crypto.getRandomValues(new Uint8Array(CLI_ACCESS_TOKEN_BYTES)));

const SCOPE_RANK = { read: 0, start: 1, admin: 2 } satisfies Record<CliAccessScope, number>;

export const scopeCovers = (held: CliAccessScope, needed: CliAccessScope): boolean =>
  SCOPE_RANK[held] >= SCOPE_RANK[needed];

export const cliScopeNeeds = (scope: CliAccessScope): { powers: AccessPower[]; all: boolean } =>
  scope === "read"
    ? { powers: ["company:dashboard:read", "company:summary:read"], all: false }
    : { powers: ["company:dashboard:read"], all: true };

export const hashCliAccessToken = (token: string): Promise<string> => sha256Hex(token);
