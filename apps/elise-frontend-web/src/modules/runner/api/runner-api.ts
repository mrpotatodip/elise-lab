import { createServerFn } from "@tanstack/react-start";
import { engineJson, jsonPost } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";
import {
  CliAccessListSchema,
  CliAccessParamSchema,
  CliAccessRevokedSchema,
  CreatedRunnerSchema,
  CreateRunnerBodySchema,
  RunnerParamSchema,
  RunnerRemovedSchema,
  RunnersSchema,
} from "../schemas";

export const fetchRunners = createServerFn({ method: "GET" }).handler(async () =>
  engineJson(RunnersSchema, "/runners", {}, await engineAuth()),
);

export const fetchCliAccess = createServerFn({ method: "GET" }).handler(async () =>
  engineJson(CliAccessListSchema, "/cli-access", {}, await engineAuth()),
);

export const revokeCliAccess = createServerFn({ method: "POST" })
  .validator(CliAccessParamSchema)
  .handler(async ({ data }) =>
    engineJson(
      CliAccessRevokedSchema,
      `/cli-access/${encodeURIComponent(data.cliAccessId)}`,
      { method: "DELETE" },
      await engineAuth(),
    ),
  );

export const createRunner = createServerFn({ method: "POST" })
  .validator(CreateRunnerBodySchema)
  .handler(async ({ data }) =>
    engineJson(CreatedRunnerSchema, "/runners", jsonPost(JSON.stringify(data)), await engineAuth()),
  );

export const removeRunner = createServerFn({ method: "POST" })
  .validator(RunnerParamSchema)
  .handler(async ({ data }) =>
    engineJson(
      RunnerRemovedSchema,
      `/runners/${encodeURIComponent(data.runnerId)}`,
      { method: "DELETE" },
      await engineAuth(),
    ),
  );
