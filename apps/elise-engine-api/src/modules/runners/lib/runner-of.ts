import type { Context } from "hono";
import type { RunnerIdentity } from "@repo/contracts/elise";
import { UnauthorizedError } from "#/lib/errors";
import { bearerTokenOf } from "#/modules/runners/utils";
import type { AppEnv } from "#/types/variables";

// -----
// The Runner behind the bearer token, or a 401. Asking records
// that it was seen. A token that is unknown or revoked is the
// same 401, so a removed Runner learns only that it is out.
// Owner role: the token names the Runner, and the Runner names
// its Account. The lookup is the runnerIdentity dep, so a route
// test can name the Runner without a database.
// -----
export const runnerOf = async (c: Context<AppEnv>): Promise<RunnerIdentity> => {
  const token = bearerTokenOf(c.req.header("authorization"));
  if (!token) throw new UnauthorizedError();
  const identity = await c.get("deps").runnerIdentity(c, token);
  if (!identity) throw new UnauthorizedError();
  return identity;
};
