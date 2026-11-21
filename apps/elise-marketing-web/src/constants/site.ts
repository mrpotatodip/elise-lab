export const SITE = {
  name: "EliseLAB",
  title: "Agent security audits for your repositories · EliseLAB",
  // The meta description: short, and plain text.
  description: "Agent security audits for your GitHub repositories. A full audit runs Cloudflare's open-source security-audit skill, and every finding is checked independently.",
  appUrl: "https://app.eliselab.com",
  // The app's own sign-up page (route /signup). appUrl lands on the sign-in page.
  signUpUrl: "https://app.eliselab.com/signup",
} as const;

// The Full audit runs this skill as published (the engine pins it in skills-lock.json). The Quick
// review runs Elise's own lighter single-agent skill, so only the full audit is credited to it.
export const CLOUDFLARE_SKILL_URL = "https://github.com/cloudflare/security-audit-skill";

// The hero paragraph. It follows the headline ("Security agents that read your code before an
// attacker does") with how it works, what you get and why to trust it.
export const LEDE = {
  start: "For teams that keep their code on GitHub. Point Elise at a repository and get a report with a fix beside every finding. A full audit runs AI agents through ",
  link: "Cloudflare's open-source security-audit method",
  middle: ", and every finding is checked independently. Once a commit has enough scans, it gets a pass or a fail. ",
  rulesLink: "What to know",
  end: " has the rules.",
} as const;

// Under the hero buttons: where they lead, before anyone clicks.
export const HERO_HINT = "Audit a repository opens Elise, where you sign in or create an account.";

export const SHOWCASE_CAPTION = "An example account. Every repository and finding is made up.";

// What a screen reader gets for each picture of the dashboard. The pictures themselves are hidden from it.
export const PICTURE_LABELS = {
  tour: "A tour of the Elise dashboard. A scan finishes and opens its first finding. A commit gets its answer. Then the overview, the reports and the GitHub connection. Every name and number is made up.",
  connect: "The Start a security audit dialog. Someone pastes a GitHub link, picks a repository and a quick review, then starts the audit.",
  audit: "A scan page during an audit. It steps through cloning, reading the code and saving the report, then shows Succeeded.",
  report: "The finished report. Four summary figures sit above four findings, each with a severity, file and status.",
} as const;

// Each step is a lead sentence and three short points, in plain technical English: one idea per
// sentence, the dashboard's own words (scan, finding, report, Files), nothing the product does not do.
export const STEPS = [
  {
    title: "Connect a repository",
    text: "Paste a GitHub URL into the Start a security audit dialog. Elise resolves the repository from it.",
    points: [
      "A public repository needs no connection. Paste the URL and start.",
      "For a private repository, connect your GitHub account first. Elise gets read access to the repositories you choose and no write access.",
      "Pick a quick review or a full audit. A quick review is one agent and finishes fast. A full audit runs several agents and takes longer.",
    ],
  },
  {
    title: "Elise audits the code",
    text: "Elise clones the repository into an isolated sandbox made for that one scan. The agents read the code there.",
    points: [
      "The scan page shows each phase as it runs: cloning, reading the code, saving the report. Succeeded means the scan finished. It does not mean the code is safe.",
      "The sandbox can reach only GitHub, to clone, and the model provider that does the review. It holds no passwords or keys of its own.",
      "On a branch Elise has scanned before, the agents re-check the earlier findings first, then look for new ones.",
    ],
  },
  {
    title: "Read the report",
    text: "The report opens with four summary figures. A list of findings follows.",
    points: [
      "Each finding names its file, explains the issue and gives a fix.",
      "Severity is Critical, High, Medium, Low or Informational. Informational is a note, not a defect. A finding nobody has rated yet shows as Unrated.",
      "If an agent could not confirm a finding, the report marks it as needing validation so a person can check it. The report stays on the Files page in Elise.",
    ],
  },
] as const;

// The two plans the live plans table offers (Starter, $15 a month, 2 members; Runner, $35 a month,
// 5 members). Older plans stay in the table but are not offered, so they are not printed. Card checkout is not claimed: the
// subscription path is not live yet. Update this when the plans table changes.
export const PRICING = {
  note: "Two plans, one flat price each. Paid sign-up opens soon. Until then, create an account and set up a Runner. There is no card checkout yet and no free trial.",
  intervals: { month: "Monthly", year: "Yearly" },
  yearlyBadge: "2 months free",
  action: "Create an account",
  actionHint: "Create an account opens the sign-up page in Elise.",
  plans: [
    {
      name: "Starter",
      price: "$15",
      yearlyPrice: "$150",
      yearlyPerMonth: "$12.50",
      summary: "Scans run on your own AI subscription through a Runner, and EliseLAB gathers every result in one place. For one or two people.",
      points: [
        "Flat price. EliseLAB adds no charge per scan.",
        "Install a Runner on your computer or a server and pair it to your account. Scans run there, on your own AI subscription, which you pay for directly.",
        "See Runners, scans, reports and findings for every repository and branch in one dashboard.",
        "Up to 2 members per account.",
      ],
    },
    {
      name: "Runner",
      price: "$35",
      yearlyPrice: "$350",
      yearlyPerMonth: "$29.17",
      summary: "Scans run on your own AI subscription through a Runner, and EliseLAB gathers every result in one place.",
      points: [
        "Flat price. EliseLAB adds no charge per scan.",
        "Install a Runner on your computer or a server and pair it to your account. Scans run there, on your own AI subscription, which you pay for directly.",
        "See Runners, scans, reports and findings for every repository and branch in one dashboard.",
        "Up to 5 members per account.",
      ],
    },
  ],
} as const;

// Each line is stated on the dashboard's own screens (Connections, the Ready to ship? card, the
// New scan dialog). Nothing here promises more than the product says.
export const FACTS = [
  { title: "It reads your code and never changes it", text: "Elise can read the repositories you choose and cannot write to them. Public repositories need no connection. Private ones need GitHub connected." },
  { title: "What a pass or a fail means", text: "A commit passes when it has been scanned at least twice, Elise re-checked the earlier findings, no Critical or High finding is open and no more than 3 Medium ones are. A fail says \"Do not ship yet\" and lists what blocks the commit. With too few scans, Elise says \"not enough scans\" instead of guessing. Scan the commit again to get an answer. Pass or fail, treat it as advice. An agent can miss a vulnerability." },
  { title: "What the severities mean", text: "Critical is the worst rating. An attacker could do serious harm with it. High is nearly as bad. Fix both before shipping. Medium is worth fixing, and a few can ship. Low is minor and does not block shipping. Unrated means nobody has rated the finding yet." },
  { title: "What it costs", text: "Starter is $15 a month for up to 2 members and Runner is $35 a month for up to 5. Both have the same features. Scans run on your own AI subscription through a Runner, so you pay that provider directly and EliseLAB adds no per-scan charge. A quick review is one agent's fast first pass. A full audit runs several agents through Cloudflare's open-source security-audit method and takes longer.", more: { href: "#pricing", label: "See the plans under Pricing." } },
] as const;

// Under "How it works": the pictures are real screens with made-up data.
export const STEPS_NOTE = "The pictures are Elise's own screens. The repositories, findings and amounts in them are made up. In Elise, one run of an audit is called a scan.";

export const CLOSING = {
  title: "Audit your first repository",
  signUp: "Create an account",
  text: " in Elise, then pair a Runner and scan a GitHub repository. Paid sign-up opens soon.",
  link: "See the plans under Pricing.",
  hint: "Audit a repository opens Elise.",
} as const;
