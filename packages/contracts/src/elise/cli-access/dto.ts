import { z } from "zod";
import { RUNNER_NAME_MAX } from "../constants";
import { CLI_ACCESS_GRANTABLE_SCOPE_VALUES, CLI_ACCESS_SCOPE_VALUES } from "../enums";

export const CliAccessIdSchema = z.uuid();

export const CliAccessScopeSchema = z.enum(CLI_ACCESS_SCOPE_VALUES);

// -----
// The scopes a login approval may give. admin is reserved.
// -----
export const CliAccessGrantableScopeSchema = z.enum(CLI_ACCESS_GRANTABLE_SCOPE_VALUES);

export const CliAccessParamSchema = z.object({
  cliAccessId: CliAccessIdSchema,
});

// -----
// One CLI access as the Runners area lists it. Never a token or a
// hash. approvedByName is the person it acts as, who approved it.
// -----
export const CliAccessSchema = z.object({
  id: CliAccessIdSchema,
  name: z.string().max(RUNNER_NAME_MAX),
  scope: CliAccessScopeSchema,
  approvedByName: z.string().nullable(),
  approvedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});

export const CliAccessListSchema = z.array(CliAccessSchema);

export const CliAccessRevokedSchema = z.object({
  revoked: z.literal(true),
});

// -----
// What the CLI collects once when the approval gave it CLI access:
// the token, shown only here, with the scope it was given.
// -----
export const CliAccessGrantSchema = z.object({
  id: CliAccessIdSchema,
  name: z.string(),
  scope: CliAccessScopeSchema,
  token: z.string(),
});

export type CliAccessScope = z.infer<typeof CliAccessScopeSchema>;
export type CliAccessGrantableScope = z.infer<typeof CliAccessGrantableScopeSchema>;
export type CliAccess = z.infer<typeof CliAccessSchema>;
export type CliAccessList = z.infer<typeof CliAccessListSchema>;
export type CliAccessRevoked = z.infer<typeof CliAccessRevokedSchema>;
export type CliAccessGrant = z.infer<typeof CliAccessGrantSchema>;
