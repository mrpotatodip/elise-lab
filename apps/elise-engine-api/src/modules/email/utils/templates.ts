import type { PasswordResetEmail, TeamInviteEmail } from "#/modules/email/types";
import { renderEmailLayout } from "./layout";

export const renderTeamInvite = (mail: TeamInviteEmail) => {
  const expires = new Date(mail.expiresAt).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });
  return renderEmailLayout({
    subject: `${mail.inviterName} invited you to ${mail.accountName} on EliseLAB`,
    preheader: `${mail.inviterName} invited you to join ${mail.accountName} on EliseLAB.`,
    heading: `Join ${mail.accountName} on EliseLAB`,
    intro: [
      { text: mail.inviterName, strong: true },
      { text: ` invited you to join ${mail.accountName}. Accept the invite to see its repositories and audit results.` },
    ],
    facts: [
      { label: "Account", value: mail.accountName },
      { label: "Your role", value: mail.roleLabel },
      { label: "Link expires", value: `${expires} (UTC)` },
    ],
    button: { label: "Accept invite", url: mail.link },
    footer: `The link works once and expires on ${expires} (UTC). If you were not expecting this invite, ignore this email: nothing happens until someone accepts.`,
  });
};

export const renderPasswordReset = (mail: PasswordResetEmail) => {
  const expires = new Date(mail.expiresAt).toLocaleTimeString("en-US", { timeStyle: "short", timeZone: "UTC" });
  return renderEmailLayout({
    subject: "Reset your EliseLAB password",
    preheader: "Choose a new password for your EliseLAB account.",
    heading: "Reset your password",
    intro: [{ text: "Someone asked to reset the password for your EliseLAB account. Choose a new one to get back in." }],
    facts: [],
    button: { label: "Choose a new password", url: mail.link },
    footer: `The link works once and expires at ${expires} UTC. If you did not ask for this, ignore this email: your password stays the same.`,
  });
};
