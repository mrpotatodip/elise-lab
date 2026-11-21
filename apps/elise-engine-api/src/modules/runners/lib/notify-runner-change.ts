import type { Context } from "hono";
import { Effect } from "effect";
import type { AccessPower } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { tenantEffectOf } from "#/lib/tenant-effect";
import { listLoginsWithPowerEffect } from "#/modules/me/queries";
import { RUNNER_NOTICE_PATH } from "#/modules/runners/constants";
import type { AppEnv } from "#/types/variables";

type RunnerChange = { kind: "runner-added" | "runner-removed"; power: AccessPower; accountId: string; runnerId: string; actorUserId: string };

export const notifyRunnerChange = (c: Context<AppEnv>, change: RunnerChange): Promise<void> =>
  runEffect(
    Effect.gen(function* () {
      const deps = c.get("deps");
      const logins = yield* tenantEffectOf(c, change.accountId)((db) => listLoginsWithPowerEffect(db, change.accountId, change.power));
      const at = new Date().toISOString();
      const link = `${c.env.DASHBOARD_URL}${RUNNER_NOTICE_PATH}`;
      yield* Effect.forEach(
        logins,
        (login) =>
          Effect.tryPromise({
            try: () => deps.enqueueEmail(c.env, { kind: change.kind, to: login.email, accountId: change.accountId, runnerId: change.runnerId, actorUserId: change.actorUserId, at, link }),
            catch: (cause) => cause,
          }).pipe(Effect.tapError((cause) => Effect.sync(() => console.error("Runner notice not queued", { kind: change.kind, cause }))), Effect.ignore),
        { discard: true },
      );
    }).pipe(Effect.tapError((cause) => Effect.sync(() => console.error("Runner notice recipients not read", { kind: change.kind, cause }))), Effect.ignore),
  );
