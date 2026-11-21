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
] as const;
