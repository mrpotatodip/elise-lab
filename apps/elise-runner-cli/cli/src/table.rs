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
];

pub const GROUPS: &[&str] = &["Connect this computer", "Run Scans", "Check", "Help"];

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
        about: "Prints a link and a code, opens the link when this computer has a desktop session, and waits up to 10 minutes for you to approve it in Elise.",
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
        needs: "A person who can approve the login in Elise. Not paired yet.",
        env: &[("ELISE_RUNNER_TOKEN", "If set, login refuses: that token is read only.")],
        examples: &["elise login", "elise login --json", "elise login --no-browser   # CI or a box with no desktop session"],
        exits: &[0, 1, 2, 5],
        json: "schemaVersion, ok, exitCode, account, runner, tokenPlace. Failure codes: unsupported, read_only_token, no_signals, cancelled, expired, denied, refused, save_failed, offline, usage",
    },
    Spec {
        name: "unpair",
        group: "Connect this computer",
        summary: "Tell Elise to drop this Runner's token, then forget it.",
        usage: "elise unpair",
        about: "The Runner stops claiming Scans and disappears from the Runners list.",
        flags: ONLY_JSON,
        needs: "A paired Runner.",
        env: &[("ELISE_RUNNER_TOKEN", "If set, unpair refuses: that token is read only.")],
        examples: &["elise unpair", "elise unpair --json", "elise unpair && echo gone   # CI cleanup"],
        exits: &[0, 1, 3, 5],
        json: "schemaVersion, ok, exitCode, wasPaired. Failure codes: read_only_token, offline, usage",
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
            ("ELISE_RUNNER_TOKEN", "The Runner's token, read only."),
        ],
        examples: &[
            "elise run",
            "elise run --json",
            "elise run --once   # CI: exit 6 when nothing is queued",
            "elise run --parallel 2",
        ],
        exits: &[0, 1, 2, 3, 4, 5, 6, 7],
        json: "one event object per line, each with schemaVersion, event, scanId and at (UTC time); labels, counts and IDs only, never model text. claimed (repo); phase_started (phase); phase_finished (phase, costUsd or null, poolLeftUsd); finding (fingerprint, verdict confirmed|needs_validation, severity or null; the full record goes to Elise); result (state succeeded|failed, sent, workFolder when kept); stopped (workFolder when kept: the Scan was stopped from Elise and sent no result). The exit code is the one without --json",
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
        name: "status",
        group: "Check",
        summary: "Say whether this Runner is unpaired, connected, revoked or offline.",
        usage: "elise status",
        about: "Also says where the token is kept and lists the kept work folders.",
        flags: ONLY_JSON,
        needs: "Nothing. It works unpaired.",
        env: &[("ELISE_RUNNER_TOKEN", "If set, it is the token used.")],
        examples: &["elise status", "elise status --json", "elise status || echo not ready   # CI: exit 3, 4 or 5"],
        exits: &[0, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, state (connected, unpaired, revoked, offline), tokenPlace (variable, keychain, file), runner and account when connected, folders (scanId, path, resumable, phases). Failure codes: unpaired, revoked, offline, usage",
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
The Elise CLI acts as a Runner. A Runner holds one token that Elise issued.

Get the token with `elise login` (browser) or `elise pair <code>` (a code from Elise).

Where the token is kept, in order:
  1. ELISE_RUNNER_TOKEN, if set. Read only: pair, login and unpair do not manage it.
  2. The system keychain, under a service name of its own.
  3. A file in your config folder that only you can read.

No command prints the token, except `pair --print-token`.
Revoke it by removing the Runner in Elise, or run `elise unpair`.
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
You pick the profile in Elise when you start the Scan. `elise run` runs what Elise sends.
",
    },
    Topic {
        name: "repos",
        summary: "Which repositories a Runner can read.",
        body: "\
A Scan clones a Repo on this computer, with this computer's git login.
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
