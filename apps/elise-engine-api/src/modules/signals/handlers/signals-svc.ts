import { Effect } from "effect";
import type { CheckAcceptedRiskBody, Signal, SignalsSettings } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { NotFound, toExternalError, type DbError } from "#/lib/effect-query";
import { SIGNAL_NO_THRESHOLD } from "#/modules/signals/constants";
import {
  dismissSignalEffect,
  findReasonCheckInputEffect,
  findSignalsSettingsEffect,
  insertWeakReasonSignalEffect,
  listSignalsEffect,
  setSignalsEnabledEffect,
  type ReasonCheckInput,
} from "#/modules/signals/queries";
import type { NoulAnswer, TypeSafeGateway } from "#/modules/typesafe";

export const getSignalsSettingsSvc = (db: AppDbType, accountId: string): Effect.Effect<SignalsSettings, DbError> => findSignalsSettingsEffect(db, accountId);

export const setSignalsEnabledSvc = (db: AppDbType, accountId: string, userId: string, enabled: boolean): Effect.Effect<SignalsSettings, DbError> =>
  setSignalsEnabledEffect(db, accountId, userId, enabled);

export const listSignalsSvc = (db: AppDbType, accountId: string, repo: string): Effect.Effect<Signal[], DbError> => listSignalsEffect(db, accountId, repo);

export const WEAK_REASON_QUESTION = "Does this note give a reason the risk is acceptable for this Finding?";

export const readReasonCheckSvc = (db: AppDbType, accountId: string, body: CheckAcceptedRiskBody): Effect.Effect<ReasonCheckInput, NotFound | DbError> =>
  Effect.gen(function* () {
    const input = yield* findReasonCheckInputEffect(db, accountId, body);
    if (input.enabled && !input.finding) return yield* new NotFound({ message: "Finding not found" });
    return input;
  });

export const askWeakReasonSvc = (gateway: TypeSafeGateway | null, input: ReasonCheckInput, note: string): Effect.Effect<NoulAnswer | null> => {
  if (!gateway || !input.finding) return Effect.succeed(null);
  const { title, description, severity, evidence } = input.finding;
  return Effect.tryPromise({ try: () => gateway.noul({ state: { finding: { title, description, severity, evidence }, note }, question: WEAK_REASON_QUESTION }), catch: toExternalError }).pipe(
    Effect.catchTag("ExternalError", (cause) => Effect.sync(() => console.error("signals: the weak-reason check got no answer", cause)).pipe(Effect.as(null))),
  );
};

export const recordWeakReasonSvc = (db: AppDbType, accountId: string, repoId: string, fingerprint: string, answer: NoulAnswer): Effect.Effect<Signal | null, DbError> =>
  answer.probability <= SIGNAL_NO_THRESHOLD ? insertWeakReasonSignalEffect(db, accountId, repoId, fingerprint, answer) : Effect.succeed(null);

export const dismissSignalSvc = (db: AppDbType, accountId: string, signalId: string): Effect.Effect<{ dismissed: true }, NotFound | DbError> =>
  Effect.gen(function* () {
    const found = yield* dismissSignalEffect(db, accountId, signalId);
    if (!found) return yield* new NotFound({ message: "Signal not found" });
    return { dismissed: true as const };
  });
