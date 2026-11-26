import type { TwoFactorNoticeEmail, TwoFactorRequirementEmail, TwoFactorResetEmail } from "#/modules/email/types";
import { renderEmailLayout } from "./layout";

const utcOf = (at: string) =>
  `${new Date(at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" })} (UTC)`;

const NOTICE_FOOTER =
  "If this was not you, change your password now and tell an admin of your Account. This is a security notice: you get it whatever your email settings.";

const OWN_WORDING = {
  "two-factor-enabled": {
    heading: "Two-factor was turned on",
    line: "Two-factor was turned on for your EliseLAB login. Other sessions were signed out.",
  },
  "two-factor-disabled": {
    heading: "Two-factor was turned off",
    line: "Two-factor was turned off for your EliseLAB login. Other sessions were signed out.",
  },
  "backup-codes-regenerated": {
    heading: "Backup codes were regenerated",
    line: "Your Backup codes were regenerated. The old ten no longer work, and other sessions were signed out.",
  },
  "backup-code-used": {
    heading: "A Backup code was used",
    line: "A Backup code was used to sign in to your EliseLAB login. It cannot be used again.",
  },
} as const;

export const renderTwoFactorNotice = (mail: TwoFactorNoticeEmail) => {
  const wording = OWN_WORDING[mail.kind];
  return renderEmailLayout({
    subject: wording.heading,
    preheader: wording.line,
    heading: wording.heading,
    intro: [{ text: wording.line }],
    facts: [{ label: "When", value: utcOf(mail.at) }],
    button: { label: "Open security settings", url: mail.link },
    footer: NOTICE_FOOTER,
  });
};

export const renderTwoFactorReset = (mail: TwoFactorResetEmail) =>
  renderEmailLayout({
    subject: "An admin reset your Two-factor",
    preheader: `${mail.actorName} reset your Two-factor in ${mail.accountName}.`,
    heading: "Your Two-factor was reset",
    intro: [
      { text: mail.actorName, strong: true },
      {
        text: ` reset your Two-factor in ${mail.accountName}. You were signed out everywhere and will set it up again at your next sign-in.`,
      },
    ],
    facts: [
      { label: "Account", value: mail.accountName },
      { label: "Reset by", value: mail.actorName },
      { label: "When", value: utcOf(mail.at) },
    ],
    button: { label: "Sign in", url: mail.link },
    footer: NOTICE_FOOTER,
  });

export const renderTwoFactorRequirementChanged = (mail: TwoFactorRequirementEmail) =>
  renderEmailLayout({
    subject: `Two-factor is now ${mail.required ? "required" : "optional"} for ${mail.accountName}`,
    preheader: `${mail.actorName} ${mail.required ? "required" : "stopped requiring"} Two-factor for ${mail.accountName}.`,
    heading: `Two-factor is ${mail.required ? "required" : "no longer required"}`,
    intro: [
      { text: mail.actorName, strong: true },
      {
        text: mail.required
          ? ` now requires Two-factor for every member of ${mail.accountName}. Members without it are sent to setup at their next sign-in.`
          : ` no longer requires Two-factor for every member of ${mail.accountName}. Admins still need it.`,
      },
    ],
    facts: [
      { label: "Account", value: mail.accountName },
      { label: "Changed by", value: mail.actorName },
      { label: "When", value: utcOf(mail.at) },
    ],
    button: { label: "Open Team", url: mail.link },
    footer: NOTICE_FOOTER,
  });
