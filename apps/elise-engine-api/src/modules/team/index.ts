import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import {
  acceptTeamInviteAPI,
  createTeamInviteAPI,
  listTeamAPI,
  listTeamRolesAPI,
  previewTeamInviteAPI,
  resetTeamMemberTwoFactorAPI,
  revokeTeamInviteAPI,
  twoFactorRequirementAPI,
} from "./api";

const app = new Hono<AppEnv>();

app.route("/", listTeamAPI);
app.route("/", listTeamRolesAPI);
app.route("/", createTeamInviteAPI);
app.route("/", revokeTeamInviteAPI);
app.route("/", resetTeamMemberTwoFactorAPI);
app.route("/", twoFactorRequirementAPI);
app.route("/", previewTeamInviteAPI);
app.route("/", acceptTeamInviteAPI);

export default app;
