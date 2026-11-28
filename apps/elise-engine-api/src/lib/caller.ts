import type { CliAccessScope } from "@repo/contracts/elise";
import type { Context } from "hono";
import { ForbiddenError } from "#/lib/errors";
import { CLI_ACCESS_OTHER_ACCOUNT, CLI_ACCESS_REFUSED } from "#/modules/cli-access/constants";
import { bearerTokenOf } from "#/modules/runners/utils";
import type { AppEnv } from "#/types/variables";

type CliRoute = { method: string; path: RegExp; scope: Exclude<CliAccessScope, "admin"> };

const CLI_ROUTES: readonly CliRoute[] = [
  { method: "GET", path: /^\/me\/?$/, scope: "read" },
  { method: "GET", path: /^\/repos\/?$/, scope: "read" },
  { method: "GET", path: /^\/repos\/[^/]+\/?$/, scope: "read" },
  { method: "GET", path: /^\/repos\/[^/]+\/(findings|verdict|archives)\/?$/, scope: "read" },
  { method: "GET", path: /^\/projects\/?$/, scope: "read" },
  { method: "GET", path: /^\/runners\/?$/, scope: "read" },
  { method: "GET", path: /^\/scans\/?$/, scope: "read" },
  { method: "GET", path: /^\/scans\/[^/]+\/?$/, scope: "read" },
  { method: "GET", path: /^\/scans\/[^/]+\/(files\/[^/]+|diff|trace)\/?$/, scope: "read" },
  { method: "GET", path: /^\/findings\/?$/, scope: "read" },
  { method: "GET", path: /^\/files\/?$/, scope: "read" },
  { method: "GET", path: /^\/usage\/?$/, scope: "read" },
  { method: "POST", path: /^\/scans\/?$/, scope: "start" },
  { method: "POST", path: /^\/scans\/[^/]+\/(stop|resume)\/?$/, scope: "start" },
  { method: "POST", path: /^\/repos\/?$/, scope: "start" },
  { method: "POST", path: /^\/repos\/[^/]+\/(branches|archives)\/?$/, scope: "start" },
  { method: "DELETE", path: /^\/repos\/[^/]+\/archives\/[^/]+\/?$/, scope: "start" },
];

export const cliRouteScopeOf = (method: string, path: string): CliRoute["scope"] | null =>
  CLI_ROUTES.find((route) => route.method === method && route.path.test(path))?.scope ?? null;

const SCOPE_RANK = { read: 0, start: 1, admin: 2 } satisfies Record<CliAccessScope, number>;

export const scopeCovers = (held: CliAccessScope, needed: CliAccessScope): boolean =>
  SCOPE_RANK[held] >= SCOPE_RANK[needed];

const cliAccessUserId = async (c: Context<AppEnv>): Promise<string | undefined> => {
  const token = bearerTokenOf(c.req.header("authorization"));
  if (!token) return undefined;
  const needed = cliRouteScopeOf(c.req.method, c.req.path);
  if (!needed) return undefined;
  const access = await c.get("deps").cliAccess(c, token);
  if (!access) return undefined;
  if (!scopeCovers(access.scope, needed)) throw new ForbiddenError(CLI_ACCESS_REFUSED);
  const accountId = c.req.header("x-account-id");
  if (accountId !== undefined && accountId !== access.accountId) throw new ForbiddenError(CLI_ACCESS_OTHER_ACCOUNT);
  return access.userId;
};

export const callerUserId = async (c: Context<AppEnv>): Promise<string | undefined> =>
  (await c.get("deps").sessionUserId(c)) ?? (await cliAccessUserId(c));
