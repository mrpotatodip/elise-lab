import type { QueuedEmail, RunnerNames } from "#/modules/email/types";
import { renderRunnerAdded, renderRunnerRemoved } from "./runner-templates";
import { renderTwoFactorNotice, renderTwoFactorRequirementChanged, renderTwoFactorReset } from "./two-factor-templates";
import {
  renderAnthropicKeyChanged,
  renderBudgetChanged,
  renderPasswordReset,
  renderPasswordResetDone,
  renderTeamInvite,
  renderVerifyEmail,
} from "./templates";

const unreachable = (mail: never): never => {
  throw new Error(`No email template for ${JSON.stringify(mail)}`);
};

const UNKNOWN_NAMES: RunnerNames = { runnerName: "a Runner", actorName: "Someone", accountName: "your Account" };

export const renderEmail = (mail: QueuedEmail, names: RunnerNames = UNKNOWN_NAMES) => {
  switch (mail.kind) {
    case "team-invite":
      return renderTeamInvite(mail);
    case "verify-email":
      return renderVerifyEmail(mail);
    case "password-reset":
      return renderPasswordReset(mail);
    case "anthropic-key-changed":
      return renderAnthropicKeyChanged(mail);
    case "budget-changed":
      return renderBudgetChanged(mail);
    case "password-reset-done":
      return renderPasswordResetDone(mail);
    case "runner-added":
      return renderRunnerAdded(mail, names);
    case "runner-removed":
      return renderRunnerRemoved(mail, names);
    case "two-factor-enabled":
    case "two-factor-disabled":
    case "backup-codes-regenerated":
    case "backup-code-used":
      return renderTwoFactorNotice(mail);
    case "two-factor-reset":
      return renderTwoFactorReset(mail);
    case "two-factor-requirement-changed":
      return renderTwoFactorRequirementChanged(mail);
    default:
      return unreachable(mail);
  }
};
