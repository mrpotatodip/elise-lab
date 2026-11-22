export const SITE = {
  name: "EliseLAB",
  title: "Agent security audits for your repositories · EliseLAB",
  // The meta description: short, and plain text.
  description: "Agent security audits for your GitHub and GitLab repositories and zip files. The audit runs on your own computer and your own AI subscription, using Cloudflare's open-source security-audit skill.",
  appUrl: "https://app.eliselab.com",
  // The app's own sign-up page (route /signup). appUrl lands on the sign-in page.
  signUpUrl: "https://app.eliselab.com/signup",
} as const;

// Every scan runs this skill as published (the engine pins it in skills-lock.json). The lite skill
// is gone, so there is one audit and the coverage setting (Focused, Balanced, Exhaustive) sets its depth.
export const CLOUDFLARE_SKILL_URL = "https://github.com/cloudflare/security-audit-skill";

// The hero paragraph. It follows the headline ("Security agents that read your code before an
// attacker does") with how it works, what you get and why to trust it.
export const LEDE = {
  start: "For teams whose code is on GitHub or GitLab, or in a zip file. Point Elise at a repository and get a report with a fix beside every finding. The audit runs on your own computer, with your own AI subscription, through",
  link: "Cloudflare's open-source security-audit method",
  middle: ". Once a commit has enough scans, it gets a pass or a fail. ",
  rulesLink: "What to know",
  end: " has the rules.",
} as const;

// Under the hero buttons: where they lead, before anyone clicks.
export const HERO_HINT = "Audit a repository opens Elise, where you sign in or create an account.";

export const SHOWCASE_CAPTION = "An example account. Every repository and finding is made up.";

// What a screen reader gets for each picture of the dashboard. The pictures themselves are hidden from it.
export const PICTURE_LABELS = {
  tour: "A tour of the Elise dashboard. A scan finishes and opens its first finding. A commit gets its answer. Then the overview, the reports and the Runners. Every name and number is made up.",
  connect: "The Start a security audit dialog. Someone picks where the code lives, pastes a GitHub link, picks a coverage level, then starts the audit.",
  audit: "A scan page during an audit. It steps through cloning, reading the code and saving the report, then shows Succeeded.",
  report: "The finished report. Four summary figures sit above four findings, each with a severity, file and status.",
} as const;

// Each step is a lead sentence and three short points, in plain technical English: one idea per
// sentence, the dashboard's own words (scan, finding, report, Files), nothing the product does not do.
export const STEPS = [
  {
    title: "Pick the code and a Runner",
    text: "Install a Runner on your computer or a server and sign it in to your account. Then start an audit in the dashboard and pick where the code lives.",
    points: [
      "Choose GitHub, GitLab, a GitLab server of your own or a zip file you upload. Paste a link or search your repositories.",
      "The Runner clones the code with the git login already on its computer, so a private repository works when your own git can read it. EliseLAB stores no git token.",
      "Pick the coverage: Focused is one bounded pass, Balanced suits most repositories and Exhaustive covers the most and takes longest.",
    ],
  },
  {
    title: "The Runner audits the code",
    text: "The scan runs on the Runner's computer, with that computer's own AI login. Your code is not uploaded to EliseLAB.",
    points: [
      "The scan page shows each step as it runs: cloning, reading the code, saving the report. Succeeded means the scan finished. It does not mean the code is safe.",
      "A running scan lists what the agent is doing, by label only, and shows verified findings as they come in. You can stop a scan at any time.",
      "The Runner sends back the report and the findings, not the repository. You pay your own AI subscription directly, and EliseLAB adds no per-scan charge.",
    ],
  },
  {
    title: "Read the report",
    text: "The report opens with four summary figures. A list of findings follows.",
    points: [
      "Each finding names its file, explains the issue and gives a fix.",
      "Severity is Critical, High, Medium, Low or Informational. Informational is a note, not a defect.",
      "If an agent could not confirm a finding, the report marks it as needing validation so a person can check it. Your team can mark a finding fixed, a false positive, an accepted risk or a duplicate, and comment on it. The report stays on the Files page in Elise.",
    ],
  },
] as const;

// The two plans the live plans table offers (Starter, $15 a month, 2 members; Runner, $35 a month,
// 5 members). Older plans stay in the table but are not offered, so they are not printed. Both rows are
// enabled with Stripe prices (checked against the live table 2026-11-22). Update this when the plans table changes.
// -----
// The yearly prices below must match the engine's plan rows (platform_master_plans: monthly and
// yearly price). The per-month figures and the "months free" badge are worked out from them.
// -----
const PLAN_USD = { starter: { month: 15, year: 150 }, runner: { month: 35, year: 350 } } as const;

const usd = (amount: number) => `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
const perMonth = (yearly: number) => usd(Math.round((yearly / 12) * 100) / 100);
const MONTHS_FREE = Math.floor(Math.min(...Object.values(PLAN_USD).map((plan) => 12 - plan.year / plan.month)));

export const PRICING = {
  note: "Two plans, one flat price each, billed monthly or yearly by card through Stripe. There is no free trial.",
  intervals: { month: "Monthly", year: "Yearly" },
  yearlyBadge: `${MONTHS_FREE} months free`,
  action: "Create an account",
  actionHint: "Create an account opens the sign-up page in Elise.",
  plans: [
    {
      name: "Starter",
      price: usd(PLAN_USD.starter.month),
      yearlyPrice: usd(PLAN_USD.starter.year),
      yearlyPerMonth: perMonth(PLAN_USD.starter.year),
      summary: "Every scan runs on your own AI subscription. For one or two people.",
      points: [
        "Flat price. EliseLAB adds no charge per scan.",
        "Install a Runner on your computer or a server and pair it to your account. Scans run there, on your own AI subscription, which you pay for directly.",
        "See Runners, scans, reports and findings for every repository and branch in one dashboard.",
        "Up to 2 members per account.",
      ],
    },
    {
      name: "Runner",
      price: usd(PLAN_USD.runner.month),
      yearlyPrice: usd(PLAN_USD.runner.year),
      yearlyPerMonth: perMonth(PLAN_USD.runner.year),
      summary: "Every scan runs on your own AI subscription. For up to five people.",
      points: [
        "Flat price. EliseLAB adds no charge per scan.",
        "Install a Runner on your computer or a server and pair it to your account. Scans run there, on your own AI subscription, which you pay for directly.",
        "See Runners, scans, reports and findings for every repository and branch in one dashboard.",
        "Up to 5 members per account.",
      ],
    },
  ],
} as const;

// Each line is stated on the dashboard's own screens (Runners, the Ready to ship? card, the
// New scan dialog). Nothing here promises more than the product says.
export const FACTS = [
  { title: "Where your code goes", text: "A scan runs in the Runner on your own computer or server, with your own AI login. The Runner sends EliseLAB the report and the findings, not the repository. A zip file you upload is the one case where EliseLAB stores your code. Private repositories work when the git login on the Runner's computer can read them, and EliseLAB never holds that login." },
  { title: "Signals", text: "Signals are optional hints, such as a possible duplicate finding. They come from an outside model provider, which receives a finding's title, description, evidence text and decision notes, and never your source code. A hint never changes a finding or a pass or fail. Signals are on for new and existing accounts, and an account admin can turn them off in Account settings.", more: { href: "/privacy", label: "The privacy page names the provider." } },
  { title: "What a pass or a fail means", text: "A commit shows \"Clear to ship\" when it has at least one finished scan, no Critical or High finding is open, no more than 3 Medium ones are, and no finding still needs validation. Low and Informational findings never block it. Otherwise the commit shows \"Blocked\" and lists what blocks it. A commit with no finished scan shows \"Needs more scans\". Treat the answer as advice. An agent can miss a vulnerability." },
  { title: "What the severities mean", text: "Critical is the worst rating. An attacker could do serious harm with it. High is nearly as bad. Fix both before shipping. Medium is worth fixing, and a few can ship. Low is minor and does not block shipping. Informational is a note, not a defect. A finding an agent could not confirm is marked as needing validation, and it blocks a pass until a person checks it." },
  { title: "What it costs", text: "Starter is $15 a month for up to 2 members and Runner is $35 a month for up to 5. Both have the same features, and yearly billing is available. Scans run on your own AI subscription through a Runner, so you pay that provider directly and EliseLAB adds no per-scan charge. Coverage sets how deep a scan goes: Focused is one bounded pass, Balanced suits most repositories and Exhaustive covers the most and takes longest.", more: { href: "#pricing", label: "See the plans under Pricing." } },
] as const;

// Under "How it works": the pictures are real screens with made-up data.
export const STEPS_NOTE = "The pictures are Elise's own screens. The repositories, findings and amounts in them are made up. In Elise, one run of an audit is called a scan.";

export const CLOSING = {
  title: "Audit your first repository",
  signUp: "Create an account",
  text: " in Elise, then sign in a Runner and scan a repository from GitHub, GitLab or a zip file.",
  link: "See the plans under Pricing.",
  hint: "Audit a repository opens Elise.",
} as const;
