import type { QueuedEmail } from "#/modules/email/types";
import { renderPasswordReset, renderTeamInvite } from "./templates";

const unreachable = (mail: never): never => {
  throw new Error(`No email template for ${JSON.stringify(mail)}`);
};

export const renderEmail = (mail: QueuedEmail) => {
  switch (mail.kind) {
    case "team-invite":
      return renderTeamInvite(mail);
    case "password-reset":
      return renderPasswordReset(mail);
    default:
      return unreachable(mail);
  }
};
