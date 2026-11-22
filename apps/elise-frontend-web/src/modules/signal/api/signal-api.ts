import { createServerFn } from "@tanstack/react-start";
import { engineJson, jsonPost } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";
import { SignalDismissedSchema, SignalListSchema, SignalParamSchema, SignalsQuerySchema, SignalsSettingsSchema, UpdateSignalsSettingsBodySchema } from "../schemas";

export const fetchSignalsSettings = createServerFn({ method: "GET" }).handler(async () => engineJson(SignalsSettingsSchema, "/usage/signals", {}, await engineAuth()));

export const updateSignalsSettings = createServerFn({ method: "POST" })
  .validator(UpdateSignalsSettingsBodySchema)
  .handler(async ({ data }) => engineJson(SignalsSettingsSchema, "/usage/signals", { ...jsonPost(JSON.stringify(data)), method: "PUT" }, await engineAuth()));

export const fetchSignals = createServerFn({ method: "GET" })
  .validator(SignalsQuerySchema)
  .handler(async ({ data }) => engineJson(SignalListSchema, `/findings/signals?repo=${encodeURIComponent(data.repo)}`, {}, await engineAuth()));

export const dismissSignal = createServerFn({ method: "POST" })
  .validator(SignalParamSchema)
  .handler(async ({ data }) => engineJson(SignalDismissedSchema, `/findings/signals/${data.signalId}/dismiss`, jsonPost("{}"), await engineAuth()));
