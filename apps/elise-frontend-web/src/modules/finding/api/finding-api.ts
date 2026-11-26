import { createServerFn } from "@tanstack/react-start";
import {
  AcceptedRiskCheckSchema,
  CheckAcceptedRiskBodySchema,
  FindingTriageBodySchema,
  FindingTriageSchema,
} from "../schemas";
import { engineJson, jsonPost } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";

export const checkAcceptedRisk = createServerFn({ method: "POST" })
  .validator(CheckAcceptedRiskBodySchema)
  .handler(async ({ data }) =>
    engineJson(
      AcceptedRiskCheckSchema,
      "/findings/signals/weak-reason",
      jsonPost(JSON.stringify(data)),
      await engineAuth(),
    ),
  );

// -----
// The engine's verb is PUT; a server function writes with POST.
// -----
export const setFindingTriage = createServerFn({ method: "POST" })
  .validator(FindingTriageBodySchema)
  .handler(async ({ data }) =>
    engineJson(
      FindingTriageSchema,
      "/findings/triage",
      { ...jsonPost(JSON.stringify(data)), method: "PUT" },
      await engineAuth(),
    ),
  );
