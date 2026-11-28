pub struct Flag {
    pub name: &'static str,
    pub short: Option<&'static str>,
    pub value: Option<&'static str>,
    pub default: &'static str,
    pub cost: &'static str,
    pub about: &'static str,
}

pub struct Spec {
    pub name: &'static str,
    pub group: &'static str,
    pub summary: &'static str,
    pub usage: &'static str,
    pub about: &'static str,
    pub flags: &'static [Flag],
    pub needs: &'static str,
    pub env: &'static [(&'static str, &'static str)],
    pub examples: &'static [&'static str],
    pub exits: &'static [i32],
    pub json: &'static str,
}

pub struct Topic {
    pub name: &'static str,
    pub summary: &'static str,
    pub body: &'static str,
}

pub const EXIT_CODES: &[(i32, &str, &str)] = &[
    (0, "ok", "success; status: connected"),
    (1, "error", "an error"),
    (2, "usage", "bad command-line usage"),
    (3, "unpaired", "this computer has no token"),
    (4, "revoked", "Elise rejected the token"),
    (5, "offline", "Elise could not be reached"),
    (6, "nothing_to_claim", "run --once: nothing to claim"),
    (7, "stopped_from_elise", "run --once: a Scan was stopped from Elise"),
    (8, "timeout", "scan --wait: --timeout ran out; the Scan keeps running"),
    (9, "partial_scan", "scan --wait: the Scan ended as a Partial Scan"),
];

pub const GROUPS: &[&str] = &["Connect this computer", "Run Scans", "Repos", "Check", "Help"];

const NO_FLAGS: &[Flag] = &[];

const JSON_FLAG: Flag = Flag {
    name: "--json",
    short: None,
    value: None,
    default: "off",
    cost: "none",
    about: "Print one JSON object on standard output. Prose goes to standard error.",
};

const ONLY_JSON: &[Flag] = &[JSON_FLAG];

pub const COMMANDS: &[Spec] = &[
    Spec {
        name: "pair",
        group: "Connect this computer",
        summary: "Pair with an Elise account using a one-time code.",
        usage: "elise pair <code> [--yes] [--print-token]",
        about: "Shows the account and the Runner name the code belongs to, and asks to confirm. For CI and for a computer with no browser.",
        flags: &[
            Flag { name: "--yes", short: Some("-y"), value: None, default: "off", cost: "none", about: "Accept without asking." },
            Flag {
                name: "--print-token",
                short: None,
                value: None,
                default: "off",
                cost: "none",
                about: "Print the token once on standard output and save nothing. The token is a credential: treat it as a password.",
            },
            JSON_FLAG,
        ],
        needs: "A one-time code from Elise (Add a Runner). Not paired yet.",
        env: &[("ELISE_RUNNER_TOKEN", "If set, pair refuses: that token is read only.")],
        examples: &[
            "elise pair PAIR-CODE-1",
            "elise pair PAIR-CODE-1 --json",
            "elise pair \"$CODE\" --yes   # CI: no question asked",
        ],
        exits: &[0, 1, 2, 5],
        json: "schemaVersion, ok, exitCode, account, runner, tokenPlace; with --print-token: token instead of tokenPlace. Failure codes: needs_yes, invalid_code, declined, read_only_token, save_failed, offline, usage",
    },
    Spec {
        name: "login",
        group: "Connect this computer",
        summary: "Connect through the browser, with no code.",
        usage: "elise login [--no-browser]",
        about: "Prints a link and a code, opens the link when this computer has a desktop session, and waits up to 10 minutes for you to approve it in Elise. The approval page has two choices: run Scans on this computer (a Runner token) and start and read Scans from this CLI (CLI access, scope read or start). Login keeps whichever you choose, each in its own place.",
        flags: &[
            Flag {
                name: "--no-browser",
                short: None,
                value: None,
                default: "off",
                cost: "none",
                about: "Only print the link and the code.",
            },
            JSON_FLAG,
        ],
        needs: "A person who can approve the login in Elise.",
        env: &[
            ("ELISE_RUNNER_TOKEN", "If set, login refuses: that token is read only."),
            ("ELISE_TOKEN", "If set, login does not store CLI access over it: the new CLI access is not saved and must be revoked in Elise."),
        ],
        examples: &["elise login", "elise login --json", "elise login --no-browser   # CI or a box with no desktop session"],
        exits: &[0, 1, 2, 5],
        json: "schemaVersion, ok, exitCode, account; runner and tokenPlace when a Runner token was kept; cliAccess (stored, scope, place when stored) when CLI access was given. Never a token. Failure codes: unsupported, read_only_token, no_signals, cancelled, expired, denied, refused, save_failed, offline, usage",
    },
    Spec {
        name: "unpair",
        group: "Connect this computer",
        summary: "Tell Elise to drop this Runner's token, then forget it and any stored CLI access.",
        usage: "elise unpair",
        about: "The Runner stops claiming Scans and disappears from the Runners list. Stored CLI access is removed from this computer, but only an admin can revoke it in Elise's Runners list.",
        flags: ONLY_JSON,
        needs: "A paired Runner or stored CLI access.",
        env: &[
            ("ELISE_RUNNER_TOKEN", "If set, unpair does not touch that Runner token: it is read only."),
            ("ELISE_TOKEN", "Never removed: CLI access from the variable is read only."),
        ],
        examples: &["elise unpair", "elise unpair --json", "elise unpair && echo gone   # CI cleanup"],
        exits: &[0, 1, 3, 5],
        json: "schemaVersion, ok, exitCode, wasPaired (a Runner token was dropped), cliAccessRemoved (stored CLI access was removed). Failure codes: read_only_token, offline, usage",
    },
    Spec {
        name: "scan",
        group: "Run Scans",
        summary: "Start a Scan of a git repo, and follow it with --wait.",
        usage: "elise scan [repo] [--branch B] [--profile P] [--budget USD] [--runner R] [--run] [--wait [--timeout T]] [--yes]",
        about: "Name the repo by URL, `owner/name` (GitHub), `gitlab:owner/name`, ID or `.`; with no argument it is `.`, this checkout and its current branch. A repo that is not added yet is added first. The profile is `standard` unless you pick one (`quick`, `standard`, `deep`, also `focused`, `balanced`, `exhaustive`). In a terminal it shows the repo, branch, profile, cap and Runner and asks `y/N`; with no terminal it needs `--yes` and exits 2 without it, starting nothing. The Runner is `--runner`, else this computer's Runner, else the Account's only connected Runner; with several it exits 2 and lists them. Without `--wait` it returns at once with the Scan ID and link. `--wait` follows the Scan and exits 0 succeeded, 1 failed, 7 stopped, 8 when `--timeout` runs out (the Scan keeps running) or 9 for a Partial Scan. `--run` also runs the Scan on this computer, as `elise run --once` does, and follows it to the end.",
        flags: &[
            Flag {
                name: "--branch",
                short: None,
                value: Some("name"),
                default: "the checkout's branch for `.`, else the repo's default branch",
                cost: "none",
                about: "Scan this branch, tag or commit.",
            },
            Flag {
                name: "--profile",
                short: None,
                value: Some("profile"),
                default: "standard",
                cost: "A deeper profile looks longer and costs more of your Claude plan.",
                about: "How deep the Scan looks: quick, standard or deep (focused, balanced and exhaustive also work).",
            },
            Flag {
                name: "--budget",
                short: None,
                value: Some("USD"),
                default: "the profile's own cap",
                cost: "The most this Scan may spend, in dollars.",
                about: "Set the Scan's cap.",
            },
            Flag {
                name: "--runner",
                short: None,
                value: Some("name"),
                default: "this computer's Runner, else the Account's only Runner",
                cost: "none",
                about: "The Runner that takes the Scan, by name or ID.",
            },
            Flag {
                name: "--run",
                short: None,
                value: None,
                default: "off",
                cost: "The Scan runs on this computer and uses your Claude plan.",
                about: "Run the Scan on this computer, with this computer's Runner, and follow it to the end. With --json the run's events come first, one per line, then the result object.",
            },
            Flag {
                name: "--wait",
                short: None,
                value: None,
                default: "off",
                cost: "none",
                about: "Follow the Scan and exit with its result.",
            },
            Flag {
                name: "--timeout",
                short: None,
                value: Some("time"),
                default: "1h",
                cost: "none",
                about: "With --wait: stop waiting after this long (90, 30m or 2h). The Scan keeps running.",
            },
            Flag {
                name: "--yes",
                short: Some("-y"),
                value: None,
                default: "off",
                cost: "Starts the Scan without asking.",
                about: "Do not ask. Needed when there is no terminal.",
            },
            JSON_FLAG,
        ],
        needs: "CLI access with scope start, from `elise login` or ELISE_TOKEN, and a connected Runner. `--run` also needs this computer's Runner token, git and `claude` signed in.",
        env: &[
            ("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it."),
            ("ELISE_RUNNER_TOKEN", "With --run, the Runner's token, read only."),
        ],
        examples: &[
            "elise scan",
            "elise scan acme/widgets --branch main --profile deep --yes",
            "elise scan . --yes --wait --timeout 90m --json   # CI: exit 0, 1, 7, 8 or 9",
            "elise scan . --run --yes   # run it on this computer",
        ],
        exits: &[0, 1, 2, 3, 4, 5, 7, 8, 9],
        json: "schemaVersion, ok, exitCode, scan (id, repo, branch or null, profile quick|standard|deep, capUsd or null, runner: {id, name}, status queued|running|succeeded|failed|stopped, link; with --wait or --run also costUsd or null, summary or null, error or null, partial), error {code, message, next} unless the Scan succeeded. Without --wait and --run the Scan is queued and status is queued. Failure codes: bad_profile, bad_budget, bad_timeout, timeout_needs_wait, needs_yes, bad_repo_name, not_a_checkout, repo_not_found, ambiguous_repo (with matches), upload_repo, unknown_runner (with matches: [{id, name}]), runner_needed (with matches), run_needs_this_runner, no_runner, unpaired, declined, scan_failed, scan_stopped, partial_scan, wait_timeout, scan_unfinished, no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "run",
        group: "Run Scans",
        summary: "Claim and run Scans until stopped.",
        usage: "elise run [--once] [--parallel N] [--json]",
        about: "Runs each Scan on this computer with your own Claude. Ctrl-C stops every running Scan and sends its report first.",
        flags: &[
            Flag {
                name: "--once",
                short: None,
                value: None,
                default: "off",
                cost: "A Scan that is queued runs and uses your Claude plan.",
                about: "Claim the Scans that are queued, run them and exit.",
            },
            Flag {
                name: "--parallel",
                short: None,
                value: Some("N"),
                default: "1",
                cost: "N Scans at once use N times the CPU, memory and Claude usage.",
                about: "Run up to N Scans at once, from 1 to 3.",
            },
            Flag {
                name: "--json",
                short: None,
                value: None,
                default: "off",
                cost: "none",
                about: "Print one JSON event per line on standard output while Scans run. Prose goes to standard error.",
            },
        ],
        needs: "A paired Runner, git, and `claude` signed in.",
        env: &[
            ("ELISE_GIT_TOKEN", "One read-only git token for clones, for CI and containers."),
            ("ELISE_RUNNER_TOKEN", "The Runner's token, read only. CLI access alone is not enough: run needs it."),
        ],
        examples: &[
            "elise run",
            "elise run --json",
            "elise run --once   # CI: exit 6 when nothing is queued",
            "elise run --parallel 2",
        ],
        exits: &[0, 1, 2, 3, 4, 5, 6, 7],
        json: "one event object per line, each with schemaVersion, event, scanId and at (UTC time); labels, counts and IDs only, never model text. claimed (repo); phase_started (phase); phase_finished (phase, costUsd or null, poolLeftUsd); finding (fingerprint, verdict confirmed|needs_validation, severity or null; the full record goes to Elise; findings arrive per Phase, just before its phase_finished, not live); result (state succeeded|failed, sent, workFolder when kept); stopped (workFolder when kept: the Scan was stopped from Elise and sent no result). When run ends without a Scan (not paired, revoked, offline, nothing to claim with --once, no signal handler) it prints one result object instead: schemaVersion, ok false, exitCode, error {code, message, next}. Failure codes: unpaired, revoked, offline, nothing_to_claim, signals_unavailable. The exit code is the one without --json",
    },
    Spec {
        name: "resume",
        group: "Run Scans",
        summary: "Say whether a failed or stopped Scan can be resumed here.",
        usage: "elise resume <scan-id>",
        about: "Lists the Phases the kept work folder holds. The resume itself starts in Elise (the Resume button on that Scan); `run` then claims it.",
        flags: ONLY_JSON,
        needs: "The work folder the Scan kept on this computer.",
        env: &[],
        examples: &["elise resume SCAN_ID", "elise resume SCAN_ID --json", "elise resume \"$SCAN_ID\" || echo no folder   # CI"],
        exits: &[0, 1, 2],
        json: "schemaVersion, ok, exitCode, scanId, resumable, phases (the finished Phases). Failure codes: not_resumable, usage",
    },
    Spec {
        name: "repos",
        group: "Repos",
        summary: "List the repos of this Account with their last Scan.",
        usage: "elise repos [--json]",
        about: "One line per repo: its Project, provider, whether it is private, its branches and the status of its last Scan. Uses CLI access (scope read is enough).",
        flags: ONLY_JSON,
        needs: "CLI access from `elise login`, or ELISE_TOKEN.",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise repos", "elise repos --json", "elise repos --json | jq '.repos[].name'   # CI"],
        exits: &[0, 1, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, repos (id, name: the text that names the repo, provider github|gitlab|gitlab-sh|upload, host, url, project: its name or null, private: true, false or null when unknown, defaultBranch or null, branches: the tracked branch names, lastScan: {id, status queued|running|succeeded|failed|stopped, at} or null). Failure codes: no_cli_access, needs_scope, revoked, offline, refused, unreadable, usage",
    },
    Spec {
        name: "repo",
        group: "Repos",
        summary: "Show one repo with its branches and Verdict.",
        usage: "elise repo <repo> [--json]",
        about: "Name the repo by URL, `owner/name` (GitHub), `gitlab:owner/name`, ID or `.` (this checkout's origin). A name that matches several repos exits 2 and lists them. The Verdict is the ship answer of the default branch at its latest succeeded Scan's commit, as Elise computes it. Run `elise help repos` for the naming rules.",
        flags: ONLY_JSON,
        needs: "CLI access from `elise login`, or ELISE_TOKEN.",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise repo acme/widgets", "elise repo . --json", "elise repo \"$REPO\" --json | jq -r '.verdict.verdict'   # CI"],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, repo (id, name, provider, host, url, project, private, defaultBranch: as in repos), branches (name, isDefault, latestScanId, latestCommit, latestScanAt: each or null), verdict ({branch, commit, verdict pass|fail|cannot_tell, reasons: [{code, message}], scans: {required, counted}, counts: {critical, high, medium, low, informational, needsValidation}} or null when the default branch has no succeeded Scan). Failure codes: bad_repo_name, not_a_checkout, repo_not_found, ambiguous_repo (with matches: [{id, name, provider, host}]), no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "status",
        group: "Check",
        summary: "Say whether this Runner is unpaired, connected, revoked or offline, and what CLI access it holds.",
        usage: "elise status",
        about: "Also says where each credential is kept, the scope of the CLI access, and lists the kept work folders. A computer with working CLI access and no Runner token exits 0: it is set up, it just does not run Scans.",
        flags: ONLY_JSON,
        needs: "Nothing. It works unpaired.",
        env: &[
            ("ELISE_RUNNER_TOKEN", "If set, it is the Runner token used."),
            ("ELISE_TOKEN", "If set, it is the CLI access used. Its scope is not known here, so scope is null."),
        ],
        examples: &["elise status", "elise status --json", "elise status || echo not ready   # CI: exit 3, 4 or 5"],
        exits: &[0, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, state (the Runner: connected, unpaired, revoked, offline), runnerTokenHeld, tokenPlace (variable, keychain, file), runner and account when connected, cliAccess (held, state none|valid|revoked|offline, scope read|start|admin or null, place variable|keychain|file or null), folders (scanId, path, resumable, phases). Failure codes: unpaired, revoked, offline, usage",
    },
    Spec {
        name: "doctor",
        group: "Check",
        summary: "Check this computer's setup, one line per check.",
        usage: "elise doctor [host...]",
        about: "Checks that git is installed, `claude` is signed in, this Runner is paired, and git can read from each host (default github.com and gitlab.com, plus those in settings). Each failure shows the fix.",
        flags: ONLY_JSON,
        needs: "Nothing. It works unpaired, and reports that.",
        env: &[],
        examples: &["elise doctor", "elise doctor --json", "elise doctor git.example.com   # CI: exit 1 on any failure"],
        exits: &[0, 1, 2],
        json: "schemaVersion, ok, exitCode, checks (name, status pass|fail|skip, detail: the fix when it failed). Failure codes: check_failed, usage",
    },
    Spec {
        name: "help",
        group: "Help",
        summary: "Show the help page of a command or a topic.",
        usage: "elise help [command|topic]",
        about: "Topics: auth, exit-codes, json, profiles, repos, ids, agents.",
        flags: NO_FLAGS,
        needs: "Nothing.",
        env: &[],
        examples: &["elise help exit-codes   # CI: the codes to handle", "elise commands --json   # the topics, with --json", "elise help run   # same as: elise run --help"],
        exits: &[0, 2],
        json: "none: help is text",
    },
    Spec {
        name: "completions",
        group: "Help",
        summary: "Print a shell completion script for zsh, bash or fish.",
        usage: "elise completions <zsh|bash|fish>",
        about: "Completes commands, flags and help topics. Load it with: source <(elise completions zsh), source <(elise completions bash) or elise completions fish | source.",
        flags: NO_FLAGS,
        needs: "Nothing.",
        env: &[],
        examples: &["elise completions zsh", "elise commands --json   # the table the script is made from", "elise completions bash > elise.bash   # CI: a file to ship"],
        exits: &[0, 2],
        json: "none: the output is a shell script",
    },
    Spec {
        name: "commands",
        group: "Help",
        summary: "List every command, flag, exit code and topic.",
        usage: "elise commands [--json | --markdown]",
        about: "For an agent: one call that shows what the Elise CLI can do.",
        flags: &[
            Flag {
                name: "--json",
                short: None,
                value: None,
                default: "off",
                cost: "none",
                about: "Print the whole table as one JSON object. Without it, print one line per command.",
            },
            Flag {
                name: "--markdown",
                short: None,
                value: None,
                default: "off",
                cost: "none",
                about: "Print the command reference as Markdown. It is the generated part of the README.",
            },
        ],
        needs: "Nothing.",
        env: &[],
        examples: &["elise commands", "elise commands --json", "elise commands --json | jq '.exitCodes'   # CI"],
        exits: &[0, 2],
        json: "schemaVersion, commands, exitCodes, topics",
    },
    Spec {
        name: "skill",
        group: "Help",
        summary: "Install the agent skill that teaches an AI agent to use the Elise CLI.",
        usage: "elise skill install [--dir <path>] [--json]",
        about: "Writes SKILL.md, built from this command table, to ~/.claude/skills/elise (or the folder given) and prints a snippet for AGENTS.md or CLAUDE.md. Run it again after an update: it replaces the file.",
        flags: &[
            Flag {
                name: "--dir",
                short: None,
                value: Some("path"),
                default: "~/.claude/skills/elise",
                cost: "none",
                about: "Write SKILL.md into this folder instead, for an agent tool other than Claude Code.",
            },
            JSON_FLAG,
        ],
        needs: "Nothing. It works unpaired.",
        env: &[],
        examples: &["elise skill install", "elise skill install --json", "elise skill install --dir ./agent-skills/elise   # CI or another agent tool"],
        exits: &[0, 1, 2],
        json: "schemaVersion, ok, exitCode, path, snippet. Failure codes: write_failed, usage",
    },
];

pub const TOPICS: &[Topic] = &[
    Topic {
        name: "auth",
        summary: "How this computer proves who it is.",
        body: "\
The Elise CLI holds up to two credentials that Elise issued, each its own entry:
  Runner token  lets this computer run Scans. `run` needs it.
  CLI access    lets the CLI act as you on repos and Scans, with a scope: read, or start (read plus
                start, stop and resume).

Get them with `elise login` (browser): the approval page asks which you want. `elise pair <code>`
gives the Runner token only.

Where each is kept, in order:
  1. ELISE_RUNNER_TOKEN (Runner token) or ELISE_TOKEN (CLI access), if set. Read only: pair, login
     and unpair do not manage them.
  2. The system keychain, under a service name of its own for each.
  3. A file in your config folder that only you can read.

No command prints a token, except `pair --print-token`.
Revoke a Runner token by removing the Runner in Elise, or run `elise unpair`. Only an admin can
revoke CLI access, in the Runners list; `elise unpair` just removes it from this computer.
",
    },
    Topic {
        name: "exit-codes",
        summary: "What each exit code means.",
        body: "\
The exit codes are a contract. A code is only ever added, never changed.
Run `elise help exit-codes` or `elise commands --json` to read them.
",
    },
    Topic {
        name: "json",
        summary: "Machine-readable output.",
        body: "\
`elise commands --json` prints one JSON object.
Other commands take `--json` too, and print one object with:
  schemaVersion  a number; it changes when a field changes meaning
  ok             true or false
  exitCode       the same number as the exit code
A failure is { ok: false, error: { code, message, next } }: `code` is a stable word, `next` the command to run.
A bad command line is a failure too: error code `usage`, exit 2.
No JSON holds a token, except `pair --print-token --json`, where it is the field `token`.
The result goes to standard output. Prose goes to standard error.
`elise run --json` prints one object per line.
",
    },
    Topic {
        name: "profiles",
        summary: "How deep a Scan looks.",
        body: "\
A Scan runs with a profile: quick, standard or deep. A deeper profile looks longer and costs more.
You pick the profile in Elise, or with `elise scan --profile` (standard unless you say otherwise; focused, balanced and
exhaustive are other names for quick, standard and deep). `elise run` runs what Elise sends.
",
    },
    Topic {
        name: "repos",
        summary: "Which repositories a Runner can read, and how to name a repo.",
        body: "\
Naming a repo. Commands that take <repo> accept:
  https://github.com/acme/widgets   a URL (also .git, git@host:path and a link into the repo)
  acme/widgets                      owner/name, always GitHub
  gitlab:group/sub/app              GitLab (gitlab.com or a self-managed server): `gitlab:` then the path
  5b0c3f0e-1d2a-4c3b-8e4f-6a7b8c9d0e1f   the repo's ID, as `elise repos --json` prints it
  .                                 the git checkout you are in: its `origin` remote, and its current branch
Case does not matter. Only repos already in this Account match. If a name matches several repos
(the same GitLab path on two servers), the command exits 2 and lists them with their IDs: name one by ID or URL.
A name that matches none exits 1. `elise repos` lists the repos and the name to type for each.

Reading a repo. A Scan clones a Repo on this computer, with this computer's git login.
github.com and gitlab.com need no setup. For another GitLab server, list it in settings.json
in the config folder: {\"gitlabHosts\": [\"git.example.com\"]}. A Scan on any other host is refused.
In CI, ELISE_GIT_TOKEN gives one read-only token. Run `elise doctor` to check access.
",
    },
    Topic {
        name: "ids",
        summary: "The ids you see in output.",
        body: "\
A Scan id names one Scan. `elise resume <scan-id>` takes it, and `elise status` lists the kept folders.
Every `run` log line starts with [repo scan-id]. Ids are opaque: compare them, do not parse them.

A command that works through CLI access names a Scan by its full id, by any unique prefix of at
least 8 characters, or by `latest`. A shorter prefix is refused with exit 2. A prefix that fits several Scans
exits 2 and lists them with their full ids. `latest` is the newest Scan: of the repo when the command
names one, else of the Account. Output always prints full ids.
A repo has an id too, and a name: see `elise help repos`.
",
    },
    Topic {
        name: "agents",
        summary: "Using the Elise CLI from an AI agent.",
        body: "\
Run `elise commands --json` once to learn every command, flag, exit code and JSON shape.
Use `--json` and read the exit code. Never rely on prose.
Use `--yes` for `pair`, because an agent cannot answer a question.
With no terminal on stdin, or with `--no-input`, the program never asks. `pair` without `--yes`
then exits 2 and names `--yes`.
",
    },
];

pub fn command(name: &str) -> Option<&'static Spec> {
    COMMANDS.iter().find(|spec| spec.name == name)
}

pub fn topic(name: &str) -> Option<&'static Topic> {
    TOPICS.iter().find(|topic| topic.name == name)
}

pub const GLOBAL_FLAGS: &[Flag] = &[Flag {
    name: "--no-input",
    short: None,
    value: None,
    default: "off; on when stdin is not a terminal",
    cost: "none",
    about: "Never ask a question. A command that needs an answer exits 2 and names the flag that gives it.",
}];

pub fn flags(spec: &Spec) -> impl Iterator<Item = &'static Flag> {
    spec.flags.iter().chain(GLOBAL_FLAGS)
}

pub fn accepts(spec: &Spec, flag: &str) -> bool {
    flags(spec).any(|known| known.name == flag || known.short == Some(flag))
}
