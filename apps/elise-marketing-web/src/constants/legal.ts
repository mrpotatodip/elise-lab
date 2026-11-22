// The sub-processors named on the privacy page: every company that receives customer data.
// This is the one place site copy names the model providers (see CLAUDE.md). A person approves the wording.
export const SUB_PROCESSORS = [
  {
    name: "Anthropic",
    purpose: "Runs the model that reads your code during a Scan.",
    receives: "The source code of the repository you scan, and the prompts Elise builds around it.",
    neverReceives: "Your account details or payment information.",
  },
  {
    name: "TypeSafe",
    purpose: "Runs the model behind Signals, which are hints about a finding or a decision.",
    receives: "A finding's title and description, its evidence text and decision notes.",
    neverReceives: "Source code.",
  },
  {
    name: "Cloudflare",
    purpose: "Hosts EliseLAB, runs the isolated sandbox for a cloud Scan and stores finished reports.",
    receives: "Everything EliseLAB handles for you: requests to the dashboard, the repository during a cloud Scan, and the stored report.",
    neverReceives: "Your card number.",
  },
  {
    name: "Neon",
    purpose: "Stores the database.",
    receives: "Your account, your repositories, Scan records and Findings.",
    neverReceives: "Source code or your card number.",
  },
  {
    name: "Stripe",
    purpose: "Takes payment and manages subscriptions.",
    receives: "Your email address and your payment details, which you enter on Stripe's own page.",
    neverReceives: "Source code, Findings or Scan records.",
  },
  {
    name: "GitHub",
    purpose: "Hosts the repositories EliseLAB clones.",
    receives: "A clone request for the repository URL you give.",
    neverReceives: "Findings or account details.",
  },
] as const;
