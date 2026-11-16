# EliseLAB Engine API Glossary

The words used by the scan service: a Worker that clones a GitHub repo (public, or private through an Install) into a sandbox, runs an AI security review, and keeps the report. Use these words in route text, tickets and lessons.

## Parts

**Scan**:
One run that clones a repo, audits it with the agent, and saves a report.
_Avoid_: Job, task, run (when you mean the whole thing)

**Scan ID**:
A random UUID that names one scan and its sandbox, and is the folder name in the R2 bucket.
_Avoid_: Job ID, request ID

**Worker**:
The Cloudflare program in `src/index.ts` that receives HTTP requests and starts scans.
_Avoid_: Server, backend, API

**Sandbox**:
One Durable Object plus the container it starts, used for exactly one scan (class `FullScanSandbox`).
_Avoid_: VM, box

**Durable Object**:
A named Cloudflare object with its own storage that controls the container for one scan.
_Avoid_: Actor, session

**Container**:
A Linux machine that starts from the image and runs the agent.
_Avoid_: Docker, VM, pod

**Image**:
The frozen file system a container starts from, built from the Dockerfile.
_Avoid_: Docker image (say "image"), snapshot

**Instance type**:
The size of a container: vCPU, memory, and disk. We use `standard-1`.
_Avoid_: Plan, tier

**R2 bucket**:
The Cloudflare storage that holds each scan's saved files.
_Avoid_: Database, S3

## The agent

**Agent**:
The Claude Code program that runs inside the container and reads the repo.
_Avoid_: Bot, AI

**Skill**:
A folder of written instructions the agent follows. We have one, `full`. Every new Scan runs it, a Runner Scan included, whatever the request sent; the Profile sets how much it covers, not the Skill. `lite` was the first Skill and is gone from the code (#141); it stays only as a value in old rows.
_Avoid_: Prompt, plugin

**Profile**:
How much audit a Scan is asked for: `quick`, `standard` or `deep` (the dashboard says Focused, Balanced and Exhaustive). It sets the Scan's Budget cap (`SCAN_PROFILE_CAPS_USD`) and its Verdict weight. No Profile means `quick`. ADR 0006 holds the caps.
_Avoid_: Tier, level, Effort (how hard the agent thinks), Skill

**Step**:
Where a running Scan is: `cloning`, `auditing` or `saving`. It is null when the Scan has not started or has ended. A full Scan is in the `auditing` Step through all four of its Phases: a Phase is a part of the audit, never a Step.
_Avoid_: Phase (a Phase is one of recon, hunt, check or report)

**Phase**:
One of the four Detached runs of a full Scan, in order: `recon`, `hunt`, `check` and `report`. They share the one pool of the Scan's Budget cap, and no Phase has a share of its own. Each has its own time limit. Only a full Scan has Phases; a lite Scan is one run. ADR 0006 holds the rules.
_Avoid_: Step (that is cloning, auditing or saving), stage

**Partial Scan**:
A profile Scan (any Profile) that ran out of money while the Skill could still write its files, so it ended with a Report that starts `PARTIAL: money ran out;` and a findings file, both naming the units it did not cover. Only money sets the flag: a Scan is partial when the Report's first line is that Skill line, a ledger unit holds `money_exhausted`, or `run-metadata.json` says `incomplete_reason: "money_exhausted"`. Any other first line that starts with `PARTIAL:` (the agent could not verify something, say) does not make a Partial Scan, on a Runner or in the cloud. It is charged only what was metered. It is not a failed Scan. It weighs 0 in a Verdict, and its findings still count as open. A Scan that spends its whole Budget cap with no Report fails instead.
_Avoid_: Incomplete, failed Scan

**Full worker**:
The only path a Scan takes, since each runs the `full` Skill: its own Workflow, its own Sandbox class and its own Image, inside the Worker. It has limits of its own. ADR 0006 holds the decisions.
_Avoid_: Full server, second Worker (it is one Worker with two paths)

**Usage**:
What a Scan spent: tokens, a cost estimate, turns and duration. The Agent reports it when it ends; a Scan that fails after the Agent started keeps it.

**Scan file**:
A file a Scan saved. Its bytes are in R2; its row in `scan_files` (Neon) holds the name, size and R2 key.

**File**:
An entry in the Account's Files list (`GET /files`): one of the written Scan files (`REPORT.md`, `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`) with the Repo, Branch and Scan it came from. The machine-readable Scan files are not listed there.
_Avoid_: Document, upload (no one uploads a File)

**Report**:
The `REPORT.md` file the agent writes for people to read.
_Avoid_: Output, result

**Repo**:
One repo an Account scans, kept once per Account (`scan_repos`) however its URL was typed: `owner/name` in lowercase, without `.git` or a trailing slash. It can be added without a Scan. Its Scans, Branches and decisions hang off it. An Account has one active Scan per Repo and at most 200 Repos.
_Avoid_: Project, target

**Branch**:
A line of code of a Repo that has a History of its own (`scan_repo_branches`). It is known by its exact name, and case counts, so `main` typed and `main` read from GitHub are one Branch. A Repo tracks at most 25. Any real branch becomes a Branch when a `lite` Scan of it succeeds and the Repo has a free slot, or when a person adds it. A profile Scan resolves no Branch today, a known gap (ADR 0004). The Repo's default branch is a pointer (`default_branch`) to the name git last reported, not a row. A new Branch starts with an empty History.
_Avoid_: Ref (a ref can also be a tag or a commit)

**One-off Scan**:
A `lite` Scan that ends with no Branch: its `ref` is a tag or a commit, the clone was on a detached HEAD, or the Repo has no free slot. It records its Findings and can count toward a Verdict, but it has no Prior findings and no History, and it saves the reason (`untracked_reason`). A `ref` is fetched as a branch first (`refs/heads/NAME`), so a tag with the same name as a branch is never read by mistake.

**History**:
Where a Branch's problems stand across its Scans (`scan_repo_findings`), one row per fingerprint, with the Scan that first and last saw it. The state is `open`, `fixed_by_code` (a Scan checked and it was gone) or `regressed` (it was fixed and came back). Only a succeeded `lite` Scan of a tracked Branch changes it, and only inside the transaction that records the Scan. It is frozen: profile Scans never change it, and the open counts of a Repo and its Branches come from it.

**Prior finding**:
An unresolved problem from the History that the Worker hands the agent (`prior-findings.json`, at most 50, worst first) to re-check before it hunts for new ones. Its `priorId` is its fingerprint. The list is saved with the Scan (`prior-findings.json`), and the answer is judged against it. A one-off Scan and a profile Scan get none. Resolved means fixed by code, or marked fixed, false positive or accepted risk by a person.

**Carried finding**:
A Prior finding the agent re-checked and still saw. It is repeated in the Scan's `findings.json` with its `priorId` and keeps its fingerprint, so a reworded title does not make it new. A Prior the agent did not answer for stays open and `unchecked`: a problem is closed only by evidence, never by silence.

**Verdict**:
The answer to "can this commit ship?": `pass`, `fail` or `cannot_tell`. It belongs to one commit and is computed on each request from the Scans of that commit. `pass` means the Scans found nothing over the limit, never that the commit is safe. `cannot_tell` means the Scans cannot be trusted yet (their Verdict weight is below 1, or a Prior finding was left unchecked). Only `pass` ships.
_Avoid_: Acceptance rate, score, safe

**Verdict weight**:
How much one succeeded Scan adds to the Verdict of its commit: `quick` 0.5, `standard` 1, `deep` 1, and an old `lite` Scan 1 (`VERDICT_SCAN_WEIGHTS`). The weight is read from the Skill first, so a `lite` Scan weighs 1 whatever its Profile. A Partial Scan weighs 0, and so does an older full Scan whose findings were never recorded. A commit has a Verdict when its Scans weigh 1 or more (`VERDICT_MIN_SCANS`).
_Avoid_: Points, score

**Accepted risk**:
A Finding that a signed-in `tenant_admin` or `workspace_admin` chose to ship with. It has a reason, a name in the Audit trail and an end date of at most 90 days. The Verdict lists it until the end date, and after that it blocks again.
_Avoid_: Waiver, exception

**Finding**:
One security problem in `findings.json`, with a status of `confirmed` or `needs_validation`.
_Avoid_: Bug, issue, vulnerability (until a person checks it)

**decision**:
A triage change to a Finding: its status (`open`, `fixed`, `false_positive` or `accepted_risk`) and its note (`scan_finding_triage`). It is not the Finding's own `confirmed` or `needs_validation` state, which the Scan wrote.
_Avoid_: Verdict (that answers a whole commit), status (a Finding has two)

**Comment**:
Plain text a signed-in member wrote about a Finding (`scan_finding_comments`), at most 4,000 characters, kept with its author's Party. It belongs to the Repo and the Finding's fingerprint, so a rescan shows it again. It stays in the database and dashboard, never in the Report, a Scan file or GitHub. Writing one needs the Power `company:findings:comments:create`; the service token cannot.
_Avoid_: Note (the decision has a note), reply

**Discussion**:
The thread of a Finding in the dashboard: its Comments and the decisions people made, oldest first, in a side sheet of its own that the "Discussion" button on each Finding row opens. Reading it needs the Dashboard Power (`GET /findings/comments`), so a Watcher never sees it.
_Avoid_: Chat, conversation

**Detached run**:
Starting the agent in the background with its output in files, then polling for its exit code.
_Avoid_: Async run

## Safety and cost

**Outbound handler**:
Worker code that sees every network request the container makes and decides to block it or pass it on. It also adds the credentials the container never holds: the Anthropic key, and for a private Repo a one-hour GitHub token for that Scan's own repo (ADR 0005).
_Avoid_: Proxy, firewall

**Allowlist**:
The short list of hosts the container may reach: `github.com` (only the read steps of git) and `api.anthropic.com`.
_Avoid_: Whitelist

**Install**:
One installation of the EliseLAB GitHub App on a GitHub account, connected to one Account by a `tenant_admin` or `workspace_admin` (`tenant_github_installations`). It holds IDs and a status, never a token. Its status is `active`, `suspended` or `removed`, as the last check saw it. The dashboard calls it a connection ("Connections").
_Avoid_: Integration, token, GitHub login

**Private Scan**:
A Scan whose Repo GitHub said is private when it was requested (`scans.is_private`), read through an active Install of its own Account. The Repo keeps the last answer for display only.
_Avoid_: Authenticated scan

**Secret**:
A value stored in the Worker, not in git, such as `ANTHROPIC_API_KEY` or `SCAN_API_TOKEN`.
_Avoid_: Env var (an env var is not always secret)

**Budget cap**:
The most dollars the agent may spend in one Scan (`--max-budget-usd`), and the one pool that all its Phases spend from. A new Scan's cap is its Profile's cap (`SCAN_PROFILE_CAPS_USD`, provisional). A request may lower it, never raise it. `MAX_BUDGET_FULL_USD` is the ceiling that guards that table for full Scans. A Runner Scan keeps `RUNNER_MAX_BUDGET_USD` as its own ceiling. ADR 0006 holds the rules.
_Avoid_: Limit, quota

**Monthly budget**:
An optional guard on the dollars an Account may spend on scans in a UTC calendar month: `tenants.monthly_scan_budget_usd`. On a Plan it applies only once an admin with the Power `company:usage:budget:update` sets it, and it counts in credit dollars (cost times the Plan's markup). A new scan is refused with `MONTHLY_BUDGET_EXCEEDED` when spent plus the cap of running scans plus its own cap would pass it. For a full Scan the refusal names the biggest smaller profile whose cap would fit, or says the budget is too low for any profile and what is left. The default monthly budget (`MONTHLY_BUDGET_USD`) no longer applies to a new Scan: a Plan Account has only the admin's override, and an Account with no Plan and no key of its own is refused before the budget is read.
_Avoid_: Quota

**Budget allowance**:
The most an admin may set as the Monthly budget: `tenants.monthly_scan_budget_allowance_usd`, or `BUDGET_ALLOWANCE_USD` (a sanity maximum) when unset. Only the operator changes it. It does not decide what the platform's key may spend: the credit balance does.
_Avoid_: Ceiling (the ceiling of a Budget cap is in its own entry), limit

**Plan**:
What an Account pays for: Pro (`pro`, $49 a month, $49 of Included credit) or Bring your own key (`byok`, $19 a month, no credit, 300 Scans a month), a row of `platform_master_plans` with a monthly price, an Included credit, a credit markup (1.5), a carry cap, a Key source and a member cap (5). The Plan decides the key: Pro always uses the platform's key and takes credit, Bring your own key needs the Account's own key and takes none. An Account's Plan is its `tenant_subscriptions` row; no row means no Plan. A full Scan on the platform's key needs a Plan (`NO_ACTIVE_PLAN` otherwise, whatever `BILLING_ENFORCED` says); an Account with no Plan that has its own key, and any Runner Scan, runs without one. A `grant` row is a Plan the operator gave, never charged. Solo and Team are disabled rows kept because subscriptions still point to them. This is the subscription, not the Instance type.
_Avoid_: Tier, subscription (for the Plan itself)

**Included credit**:
The dollars a paid period of a Plan adds to the Account's credit balance (`tenant_credit_ledger`, one signed sum of grants, top-ups, holds and charges). A balance may not be pushed past the Plan's carry cap ($100 on Pro) by a grant. A new scan on the platform's key holds its Budget cap times the markup and is refused with `INSUFFICIENT_CREDIT` when the balance is lower; when it ends it is charged its metered cost times the markup. Scans on the Account's own key take no credit.
_Avoid_: Allowance, quota

**Key source**:
Which Anthropic key paid for a scan, `platform` or `account`, kept in `scans.key_source` and set when the scan is accepted. A scan from before the column is `platform`.
_Avoid_: Key type

**Effort**:
How hard the agent thinks: `low`, `medium`, `high`, `xhigh`, or `max`.
_Avoid_: Quality, depth

## Ambiguities

- "Sandbox" means the Durable Object and the container together. "Container" means the Linux machine only.
- A finding is not a confirmed vulnerability until a person checks it.

**Account**:
The customer that owns scans. In the database an Account is a Tenant row, and the Account ID is the Tenant's UUID. The dashboard server sends it in the `x-account-id` header, taken from the signed-in session.
_Avoid_: user, org

**Tenant**:
The database row of an Account (`tenants`). It belongs to one Party. Scans, Findings and team invites carry its ID.

**Team**:
Everyone who holds a Role in an Account, plus the invites still waiting. A `tenant_admin` or `workspace_admin` manages it (a `workspace_admin` cannot change or remove a member).
_Avoid_: Members list (when you mean the whole Team), Group

**Team invite**:
An email, a Role and a one-time link that lets one person join an Account. The Worker emails the link through a queue (`INVITE_EMAIL_QUEUE`, then Cloudflare Email Service), and the create answer also holds the token so the admin can share the link by hand. Only the hash of its token is stored. It lasts 7 days, works once, and a new invite for the same email replaces the old one. It can never give `tenant_admin`.
_Avoid_: Invitation, invite code (an invite code starts a whole new Account: `platform_invite_codes`)

**Group**:
A named set of people in one Account, for example "Backend". It grants nothing: Powers still come from a Role. Names are unique per Account, ignoring case. Losing the Role in the Account removes the person from its Groups.
_Avoid_: Team (the Team is the whole roster), squad

**Power**:
An action a Role may take, written as a colon path to a leaf of the access catalogue (`@repo/contracts/elise`), for example `company:team:groups:create`. A Role holds exact Powers: no wildcards, and a parent path grants nothing below it. A route asks for one and the Role's grants decide.
_Avoid_: Permission, scope

**Watcher**:
A login whose Role is `workspace_watcher`: it holds only `company:summary:read`. It sees the Summary page and nothing behind the Dashboard Power, so it cannot read a Scan, a Discussion or a Verdict.
_Avoid_: Viewer, guest

**Audit trail**:
`access_audit_log`. It holds every kind of change an Account makes to itself, each with the actor's Party and the Tenant in `after`: Team invites, Groups, triage decisions (`finding.triage.set`, `finding.risk.accepted`), comment deletes (`finding.comment.deleted`), GitHub installs, the monthly budget and the Anthropic key.

**Party**:
Any actor that the system knows. Its type is a row in `party_master_types`: a Person or an Organization.

**Person**:
A Party of the type `person`. It has a first name and a last name (`party_persons`).

**Organization**:
A Party of the type `organization`. It has one name (`party_organizations`).

**Login**:
A way to sign in (`auth_user`). It belongs to one Party. Its `name` column always has a value; first and last name exist only for a Person.

**Service token**:
The secret `SCAN_API_TOKEN`. Only a server holds it, and every `/scans` route needs it as a bearer token.
_Avoid_: API key, password
