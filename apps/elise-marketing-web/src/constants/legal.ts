// The company behind EliseLAB and its postal address, for the Contact section of both pages.
export const COMPANY = {
  name: "Lynkfire Limited",
  address: ["3 Alana Place", "Mt Wellington", "Auckland", "New Zealand"],
  email: "admin@eliselab.com",
} as const;

// The sub-processors named on the privacy page: every company that receives customer data.
// This is the one place site copy names the model providers (see CLAUDE.md). A person approves the wording.
export const SUB_PROCESSORS = [
  {
    name: "TypeSafe",
    purpose: "Runs the model behind Signals, which are hints about a finding or a decision.",
    receives: "A finding's title and description, its evidence text and decision notes.",
    neverReceives: "Source code.",
  },
  {
    name: "Cloudflare",
    purpose: "Hosts the dashboard and the engine, stores finished reports and zip files you upload, and sends the invitations and security notices by email.",
    receives: "Everything the Runner sends to us, which is the report and its Findings, and the email address and text of each notice. It also receives a zip of source code if you upload one.",
    neverReceives: "Your card number, or code the Runner reads from a Git repository on your computer.",
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
] as const;
