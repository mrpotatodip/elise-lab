export const SITE = {
  name: "EliseLAB",
  title: "Agent security audits for your repositories · EliseLAB",
  // The meta description: short, and plain text.
  description: "Agent security audits for your GitHub repositories. A full audit runs Cloudflare's open-source security-audit skill, and every finding is checked independently.",
  appUrl: "https://app.eliselab.com",
} as const;

// The Full audit runs this skill as published (the engine pins it in skills-lock.json). The Quick
// review runs Elise's own lighter single-agent skill, so only the full audit is credited to it.
export const CLOUDFLARE_SKILL_URL = "https://github.com/cloudflare/security-audit-skill";

// The hero paragraph. It follows the headline ("Security agents that read your code before an
// attacker does") with how it works, what you get and why to trust it.
export const LEDE = {
  start: "For teams that keep their code on GitHub. Point Elise at a repository, the folder that holds your code on GitHub, and get a report with a fix beside every finding. A full audit has AI agents work through ",
  link: "Cloudflare's open-source security-audit method",
  end: ", and every finding is checked independently. Each commit, one saved change to your code, gets a pass or a fail, explained under What to know.",
} as const;

// Under the hero buttons: where they lead, before anyone clicks.
export const HERO_HINT = "Audit a repository opens the Elise app, where you sign in or create an account.";

export const SHOWCASE_CAPTION = "An example account. Every repository and finding is made up.";

// What a screen reader gets for each picture of the dashboard. The pictures themselves are hidden from it.
export const PICTURE_LABELS = {
  tour: "A tour of the Elise dashboard. A scan finishes and its first finding opens, a commit gets its answer, then the overview, the reports and the GitHub connection. Every name and number in it is made up.",
  connect: "The Start a security audit dialog. A GitHub link is pasted, the repository and a quick review are chosen, and the audit is started.",
  audit: "A scan page while the audit runs. It steps through cloning, reading the code and saving the report, then shows Succeeded.",
  report: "The finished report: four summary figures, then four findings with their severity, file and status.",
} as const;

// Each step is a lead sentence and three short points, in plain technical English: one idea per
// sentence, the dashboard's own words (scan, finding, report, Files), nothing the product does not do.
export const STEPS = [
  {
    title: "Connect a repository",
    text: "Paste a GitHub link in the Start a security audit dialog. Elise takes the repository from the link.",
    points: [
      "A public repository needs no connection. Paste the link and start.",
      "For a private repository, connect your GitHub account first. Elise can read the repositories you choose. It cannot write to them.",
      "Choose a quick review or a full audit. A quick review is one agent and is fast. A full audit uses several agents and takes longer.",
    ],
  },
  {
    title: "Elise audits the code",
    text: "Elise copies the repository into a temporary workspace that exists for this one scan. Agents read the code there.",
    points: [
      "The scan page shows where the scan is: cloning, reading the code, then saving the report.",
      "While it runs, the workspace can contact only GitHub, to read your code, and the AI service that does the review. It holds no passwords or keys of its own.",
      "On a branch that Elise has scanned before, the agents re-check the earlier problems first. Then they look for new ones. A branch is a separate line of work in your repository.",
    ],
  },
  {
    title: "Read the report",
    text: "The report opens with four summary figures. A list of findings follows.",
    points: [
      "Each finding names its file, says what it means and gives a fix.",
      "A finding is rated Critical, High, Medium, Low or Informational. Informational is a note, not a problem. A finding that no one has rated shows as Unrated.",
      "If an agent could not confirm a finding, the report says it needs validation, so a person can check it. The report stays on the Files page of the Elise app.",
    ],
  },
] as const;

// The two plans the live plans table holds (Pro, and Bring your own key) with the words the
// dashboard's Plan and Credit pages use, and the rules the engine enforces (a scan needs its hold
// free to start, the scan allowance is a hard stop). The markup is deliberately not printed. Top-ups
// are not claimed: the app cannot take a card yet. The 30-day credit expiry after a cancel is the
// agreed design, not yet enforced: it needs Stripe. Update this when the plans table changes.
export const PRICING = {
  note: "You can create an account in the Elise app and run a scan today. Paid plans open for sign-up soon. Until then there is no card checkout and no free trial.",
  action: "Create an account",
  actionHint: "Create an account opens the Elise app.",
  plans: [
    {
      name: "Pro",
      price: "$49",
      summary: "Scans run on our key and take credit from your balance.",
      points: [
        "$49 of credit is added each month.",
        "A scan takes credit based on what it cost to run, and no scan takes more than about $3. A failed scan takes only what it used before it failed. You can start a new scan afterwards.",
        "To start a scan you need about $3 of credit free. A running scan holds that much and gives back what it did not use.",
        "When the credit runs out, scans stop. Elise does not bill you for going over.",
        "Unused credit carries over, up to $100.",
        "If you cancel, your credit stays usable for 30 days, then expires.",
        "Up to 5 people.",
      ],
    },
    {
      name: "Bring your own key",
      price: "$19",
      summary: "Scans run on your own key, an access code from the AI service, so they use no credit.",
      points: [
        "Add your key under Settings in the Elise app before the first scan. Scans do not run without it.",
        "The AI service bills the use on your key, not Elise.",
        "300 scans a month. At 300, scans stop until the 1st of the next month, UTC.",
        "Up to 5 people.",
      ],
    },
  ],
} as const;

// Each line is stated on the dashboard's own screens (Connections, the Ready to ship? card, the
// New scan dialog). Nothing here promises more than the product says.
export const FACTS = [
  { title: "It reads your code and never changes it", text: "Elise can read the repositories you choose and cannot write to them. Public repositories need no connection. Private ones need GitHub connected." },
  { title: "What a pass or a fail means", text: "A commit passes when it has been scanned at least twice and earlier problems were re-checked. It also needs no open Critical or High finding, and no more than 3 open Medium ones. A fail says \"Do not ship yet\" and lists what blocks the commit. With too few scans you get \"not enough scans\", not a guess. Either answer is advice, not proof, because an agent can miss a problem." },
  { title: "How serious a finding is", text: "Critical is the worst rating: an attacker could use it to do serious harm. High is nearly as bad. Fix both before shipping. Medium is worth fixing, and a few can ship. Low is minor and does not block shipping. A finding no one has rated yet shows as Unrated until a person decides." },
  { title: "What it costs", text: "Each audit stops at its own spend limit. On Pro, a scan takes credit from your balance, and no scan takes more than about $3. On Bring your own key, your own key pays for it. A quick review is one agent's fast first look. A full audit sends several agents through Cloudflare's open-source method and takes longer. The plans are under Pricing." },
] as const;

// Under "How it works": the pictures are real screens with made-up data.
export const STEPS_NOTE = "The pictures are Elise's own screens. The repositories, findings and amounts in them are made up. In Elise, one run of an audit is called a scan.";

export const CLOSING = {
  title: "Audit your first repository",
  text: "Create an account in the Elise app, then paste a GitHub link. That is the address of your repository on github.com. You can run a scan today. Paid plans open for sign-up soon: see Pricing.",
  hint: "Audit a repository opens the Elise app.",
} as const;
