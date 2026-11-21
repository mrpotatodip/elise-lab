import type { QueuedEmail } from "#/modules/email/types";
import { renderAnthropicKeyChanged, renderBudgetChanged, renderPasswordReset, renderPasswordResetDone, renderTeamInvite } from "./templates";

const unreachable = (mail: never): never => {
  throw new Error(`No email template for ${JSON.stringify(mail)}`);
};

export const renderEmail = (mail: QueuedEmail) => {
  switch (mail.kind) {
    case "team-invite":
      return renderTeamInvite(mail);
    case "password-reset":
      return renderPasswordReset(mail);
    case "anthropic-key-changed":
      return renderAnthropicKeyChanged(mail);
    case "budget-changed":
      return renderBudgetChanged(mail);
    case "password-reset-done":
      return renderPasswordResetDone(mail);
    default:
      return unreachable(mail);
  }
};
