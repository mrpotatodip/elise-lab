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

export const cliScopePowers = (scope: CliAccessScope): AccessPower[] =>
  scope === "read" ? ["company:dashboard:read", "company:summary:read"] : ["company:dashboard:read"];

export const hashCliAccessToken = (token: string): Promise<string> => sha256Hex(token);
