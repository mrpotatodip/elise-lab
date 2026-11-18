export const DEVICE_RUNNER_POWER = "company:runners:create";

export const DEVICE_COPY = {
  title: "Connect a Runner",
  hint: "Check that this code matches the one in your terminal.",
  codeLabel: "Code in your terminal",
  warningBefore: "Only approve if you ran ",
  warningCommand: "elise-runner login",
  warningAfter: " yourself just now.",
  ipDiffers: "This login was requested from a different IP address than the one you are using now. That is not blocked, but approve only if you started it.",
  noAccount: "None of your accounts lets you add Runners. Ask an account admin to add this Runner, or to give you the access.",
  approve: "Approve",
  approving: "Approving",
  doneTitle: "Your terminal is connected",
  doneHint: "You can close this page.",
  unusableTitle: "This code can't be used",
  unusableDescription: "It may be wrong, have expired after 10 minutes, or already been used. Run elise-runner login again in your terminal to get a new one.",
  unusableAction: "Go to the dashboard",
  tabTitle: "This code can't be used · Elise",
} as const;
