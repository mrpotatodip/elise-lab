import { createServerFn } from "@tanstack/react-start";
import { engineJson, jsonPost } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";
import { SignalsSettingsSchema, UpdateSignalsSettingsBodySchema } from "../schemas";

export const fetchSignalsSettings = createServerFn({ method: "GET" }).handler(async () => engineJson(SignalsSettingsSchema, "/usage/signals", {}, await engineAuth()));

export const updateSignalsSettings = createServerFn({ method: "POST" })
  .validator(UpdateSignalsSettingsBodySchema)
  .handler(async ({ data }) => engineJson(SignalsSettingsSchema, "/usage/signals", { ...jsonPost(JSON.stringify(data)), method: "PUT" }, await engineAuth()));
