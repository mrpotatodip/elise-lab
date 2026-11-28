export const DEVICE_RUNNER_POWER = "company:runners:create";

export const DEVICE_DASHBOARD_POWER = "company:dashboard:read";
export const DEVICE_SUMMARY_POWER = "company:summary:read";

export const DEVICE_COPY = {
  title: "Approve this login",
  choicesLegend: "What may this computer do?",
  runScansLabel: "Run Scans on this computer",
  runScansHint: "It becomes a Runner of the account and takes Scans, with your own Claude and git login.",
  cliLegend: "Start and read Scans from this CLI",
  cliHint: "The Elise CLI acts as you in this account. You can revoke it under Runners.",
  cliNone: "No CLI access",
  cliRead: "Read only",
  cliStart: "Read and start",
  noChoice: "Choose at least one: run Scans on this computer, or give the Elise CLI access.",
  roleLimit: "Your role in this account does not allow this.",
  hint: "Check that this code matches the one in your terminal.",
  codeLabel: "Code in your terminal",
  warningBefore: "Only approve if you ran ",
  warningCommand: "elise login",
  warningAfter: " yourself just now.",
  ipDiffers:
    "This login was requested from a different IP address than the one you are using now. That is not blocked, but approve only if you started it.",
  noAccount:
    "None of your accounts lets you add Runners or use the Elise CLI. Ask an account admin to add this Runner, or to give you the access.",
  approve: "Approve",
  approving: "Approving",
  deny: "Deny",
  denying: "Denying",
  deniedTitle: "Request denied",
  deniedHint: "The terminal that asked will stop waiting. You can close this page.",
  doneTitle: "Your terminal is connected",
  doneHint: "You can close this page.",
  unusableTitle: "This code can't be used",
  unusableDescription:
    "It may be wrong, have expired after 10 minutes, or already been used. Run elise login again in your terminal to get a new one.",
  unusableAction: "Go to the dashboard",
  tabTitle: "This code can't be used · Elise",
} as const;
