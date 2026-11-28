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

pub const GROUPS: &[&str] = &["Connect this computer", "Run Scans", "Repos", "Results", "Check", "Help"];

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
        summary: "Start a Scan of a git repo or an uploaded zip, and follow it with --wait.",
        usage: "elise scan [repo] [--branch B] [--zip FILE --app NAME] [--profile P] [--budget USD] [--runner R] [--run] [--wait [--timeout T]] [--yes]",
        about: "Name the repo by URL, `owner/name` (GitHub), `gitlab:owner/name`, ID or `.`; with no argument it is `.`, this checkout and its current branch. A repo that is not added yet is added first. To scan code that is not in a git host, give `--zip FILE --app NAME` instead of a repo: the zip is checked here with the dashboard's rules (a .zip file of at most 50 MB, see `elise archives add`), the upload app is created if it is new, the zip is streamed up and Elise Scans it; a zip that fails a rule exits 2 before anything is sent. `--zip` and `--app` go together and take no repo and no `--branch`. The profile is `standard` unless you pick one (`quick`, `standard`, `deep`, also `focused`, `balanced`, `exhaustive`). In a terminal it shows the repo, branch, profile, cap and Runner and asks `y/N`; with no terminal it needs `--yes` and exits 2 without it, starting nothing. The Runner is `--runner`, else this computer's Runner, else the Account's only connected Runner; with several it exits 2 and lists them. Without `--wait` it returns at once with the Scan ID and link. `--wait` follows the Scan and exits 0 succeeded, 1 failed, 7 stopped, 8 when `--timeout` runs out (the Scan keeps running) or 9 for a Partial Scan. `--run` also runs the Scan on this computer, as `elise run --once` does, and follows it to the end.",
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
                name: "--zip",
                short: None,
                value: Some("file"),
                default: "none: scan a git repo",
                cost: "Uploads the zip to Elise, which deletes it 30 days after upload unless a Scan reads it.",
                about: "Scan this .zip file instead of a git repo. Needs --app.",
            },
            Flag {
                name: "--app",
                short: None,
                value: Some("name"),
                default: "none",
                cost: "A name that is new makes an upload app.",
                about: "The upload app the zip goes under, by name or ID. Needs --zip.",
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
            "elise scan --zip ./billing.zip --app billing --profile deep --yes",
            "elise scan . --yes --wait --timeout 90m --json   # CI: exit 0, 1, 7, 8 or 9",
            "elise scan . --run --yes   # run it on this computer",
        ],
        exits: &[0, 1, 2, 3, 4, 5, 7, 8, 9],
        json: "schemaVersion, ok, exitCode, scan (id, repo, branch or null, profile quick|standard|deep, capUsd or null, runner: {id, name}, status queued|running|succeeded|failed|stopped, link; with --wait or --run also costUsd or null, summary or null, error or null, partial), error {code, message, next} unless the Scan succeeded. With --zip, branch is null and the scan also holds archive (id, label, sizeBytes: the zip sent) and app (id, created: true when this call made the app). Without --wait and --run the Scan is queued and status is queued. Failure codes: bad_profile, bad_budget, bad_timeout, timeout_needs_wait, needs_yes, zip_needs_app, app_needs_zip, zip_takes_no_repo, zip_takes_no_branch, bad_app_name, zip_not_found, not_a_zip_file, zip_too_large, not_a_zip, too_many_files, path_too_deep, unpacked_too_large, too_many_zips (the zip ones exit 2 and send nothing), bad_repo_name, not_a_checkout, repo_not_found, ambiguous_repo (with matches), upload_repo, unknown_runner (with matches: [{id, name}]), runner_needed (with matches), run_needs_this_runner, no_runner, unpaired, declined, scan_failed, scan_stopped, partial_scan, wait_timeout, scan_unfinished, no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
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
        name: "scans",
        group: "Run Scans",
        summary: "List the newest Scans of this Account, newest first.",
        usage: "elise scans [--repo <repo>] [--json]",
        about: "One line per Scan with its repo, branch, profile, status and start day, up to 100. With `--repo` only that repo's Scans (a URL, `owner/name`, `gitlab:owner/name`, ID or `.`). Uses CLI access (scope read is enough).",
        flags: &[
            Flag {
                name: "--repo",
                short: None,
                value: Some("repo"),
                default: "every repo",
                cost: "none",
                about: "Only the Scans of this repo. A name that matches several repos exits 2 and lists them.",
            },
            JSON_FLAG,
        ],
        needs: "CLI access from `elise login`, or ELISE_TOKEN.",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise scans", "elise scans --repo acme/widgets --json", "elise scans --json | jq -r '.scans[0].id'   # CI"],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, scans (id: the full Scan ID, repo, repoId, branch or null, status queued|running|succeeded|failed|stopped, profile or null, createdAt, finishedAt or null), newest first. Failure codes: bad_repo_name, not_a_checkout, repo_not_found, ambiguous_repo (with matches: [{id, name, provider, host}]), no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "scan-show",
        group: "Run Scans",
        summary: "Show one Scan: status, run details and cost.",
        usage: "elise scan show <scan-id> [--json]",
        about: "Name the Scan by its full ID, a prefix of at least 8 characters, or `latest`. Shows its repo, branch, commit, profile, model, cap, Runner, times, cost with the split by Phase, and the counts of what it found. Run `elise help ids` for the naming rules. Also reachable as `elise scan-show`.",
        flags: ONLY_JSON,
        needs: "CLI access from `elise login`, or ELISE_TOKEN.",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise scan show latest", "elise scan show 0abc1234 --json", "elise scan show \"$SCAN_ID\" --json | jq -r '.scan.status'   # CI"],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, scan (id, repo, repoId, branch, commit, status queued|running|succeeded|failed|stopped, step, profile, profileMet, model, effort, budgetUsd, createdAt, updatedAt, finishedAt, error, failureCode: each or null; runner: {id, name} or null; resumes: the Scan this one resumes or null; resumedBy: the Scan that resumed it or null), cost ({costUsd, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, turns, durationMs, phases: [{phase, costUsd, durationMs}]} or null when no usage is recorded), summary ({total, severity: {critical, high, medium, low, informational}, needsValidation, new, carried} or null). Failure codes: bad_scan_id, scan_not_found, ambiguous_scan (with matches: [{id, repo, status}]), no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "trace",
        group: "Run Scans",
        summary: "Show the Phases and labels a Scan went through.",
        usage: "elise trace <scan-id> [--json]",
        about: "The Trace is labels, counts and times only, never what the agent wrote. Name the Scan by its full ID, a prefix of at least 8 characters, or `latest`.",
        flags: ONLY_JSON,
        needs: "CLI access from `elise login`, or ELISE_TOKEN.",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise trace latest", "elise trace 0abc1234 --json", "elise trace \"$SCAN_ID\" --json | jq '.entries | length'   # CI"],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, scanId, entries (id, label, phase or null, startedAt, endedAt, count: how many times the label repeated in a row), in display order, candidateFindings (the count so far, or null). Failure codes: bad_scan_id, scan_not_found, ambiguous_scan (with matches: [{id, repo, status}]), no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "stop",
        group: "Run Scans",
        summary: "Stop a Scan that is queued or running.",
        usage: "elise stop <scan-id> [--json]",
        about: "Name the Scan by its full ID, a prefix of at least 8 characters, or `latest`. Elise stops it and keeps what it has; a Scan on a Runner stops that Runner's run. A Scan that already finished is refused with exit 1. Needs CLI access with scope start.",
        flags: ONLY_JSON,
        needs: "CLI access with scope start, from `elise login`, or ELISE_TOKEN.",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise stop latest", "elise stop 0abc1234 --json", "elise stop \"$SCAN_ID\" --json   # CI"],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, scanId, status (stopped, or the state Elise reports), repo. Failure codes: bad_scan_id, scan_not_found, ambiguous_scan (with matches: [{id, repo, status}]), no_cli_access, needs_scope (exit 2: the CLI access holds scope read), revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "resume",
        group: "Run Scans",
        summary: "Start a resume of a stopped or failed Scan, and say whether its work folder can be resumed here.",
        usage: "elise resume <scan-id> [--json]",
        about: "Name the Scan by its full ID, a prefix of at least 8 characters, or `latest`. Elise queues a new Scan that carries on from the finished Phases, on the Runner that ran the first one; `elise run` there claims it. The output also says whether the work folder this computer kept can be resumed, and which Phases it holds. A Scan that is not stopped or failed is refused with exit 1. Needs CLI access with scope start. With no CLI access on this computer, it only checks the kept work folder, as before.",
        flags: ONLY_JSON,
        needs: "CLI access with scope start, from `elise login`, or ELISE_TOKEN. Without it, the work folder the Scan kept on this computer.",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise resume latest", "elise resume 0abc1234 --json", "elise resume \"$SCAN_ID\" --json   # CI"],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, scanId (the Scan that was resumed), resumable (this computer's work folder can be resumed), phases (the Phases that folder holds), started (true when a resume was queued), newScanId, status (queued). Without CLI access only scanId, resumable and phases, and the failure code not_resumable (exit 1) when no folder can be resumed. Failure codes: not_resumable, bad_scan_id, scan_not_found, ambiguous_scan (with matches: [{id, repo, status}]), needs_scope (exit 2: the CLI access holds scope read), revoked, offline, not_found, refused, unreadable, usage",
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
        name: "archives-add",
        group: "Repos",
        summary: "Upload a zip to an upload app, creating the app if it is new.",
        usage: "elise archives add <app> <file> [--json]",
        about: "An upload app holds the zips of code that is not in a git host. Name it by its name or its ID; a name that is new makes the app. The zip is checked here first with the dashboard's rules and sent only if it passes: a .zip file of at most 50 MB that unpacks to at most 250 MB, holds at most 20,000 files and has no path deeper than 20 levels; an app holds at most 20 zips. The file is streamed, not read into memory, and its name is its label. Elise checks the same rules again. Needs CLI access with scope start. Scan it with `elise scan --zip <file> --app <app>`.",
        flags: ONLY_JSON,
        needs: "CLI access with scope start, from `elise login`, or ELISE_TOKEN.",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise archives add billing ./billing.zip", "elise archives add billing ./billing.zip --json", "elise archives add \"$APP\" \"$ZIP\" --json | jq -r '.archive.id'   # CI"],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, app (id, name, created: true when this call made the app), archive (id, label, sizeBytes, contentSha256, uploadedAt). Failure codes: bad_app_name, zip_not_found, not_a_zip_file, zip_too_large, not_a_zip, too_many_files, path_too_deep, unpacked_too_large, too_many_zips (all exit 2 and send nothing), no_cli_access, needs_scope (exit 2: the CLI access holds scope read), revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "archives-list",
        group: "Repos",
        summary: "List the zips of an upload app.",
        usage: "elise archives list <app> [--json]",
        about: "Name the upload app by its name or its ID. One line per zip, newest first, with its label, size, upload time and ID. Uses CLI access (scope read is enough).",
        flags: ONLY_JSON,
        needs: "CLI access from `elise login`, or ELISE_TOKEN.",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise archives list billing", "elise archives list billing --json", "elise archives list \"$APP\" --json | jq -r '.archives[0].id'   # CI"],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, app (id, name), archives (id, label, sizeBytes, contentSha256, uploadedAt). Failure codes: app_not_found, no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "archives-remove",
        group: "Repos",
        summary: "Delete one zip of an upload app.",
        usage: "elise archives remove <app> <label or ID> [--yes] [--json]",
        about: "Name the upload app by its name or its ID, and the zip by its ID or its label. A label that fits several zips exits 2 and lists them with their IDs. The zip is deleted from Elise for good; the Scans that read it stay in the History, marked as having no file. In a terminal it asks `y/N`; with no terminal it needs `--yes` and exits 2 without it, deleting nothing. Needs CLI access with scope start.",
        flags: &[
            Flag {
                name: "--yes",
                short: Some("-y"),
                value: None,
                default: "off",
                cost: "Deletes the zip without asking.",
                about: "Do not ask. Needed when there is no terminal.",
            },
            JSON_FLAG,
        ],
        needs: "CLI access with scope start, from `elise login`, or ELISE_TOKEN.",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise archives remove billing billing.zip", "elise archives remove billing 6f1a2b3c-0000-4000-8000-000000000000 --json", "elise archives remove \"$APP\" \"$ZIP_ID\" --yes --json   # CI"],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, app (id, name), archive (id, label), removed: true. Failure codes: app_not_found, archive_not_found, ambiguous_archive (with matches: [{id, label, uploadedAt}]), needs_yes, declined, no_cli_access, needs_scope (exit 2: the CLI access holds scope read), revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "report",
        group: "Results",
        summary: "Show a Scan's summary, counts by severity, Verdict and top findings.",
        usage: "elise report <scan-id> [--full] [--json]",
        about: "The same figures the Scan page in Elise shows: the finding counts, what is new and carried over, the cost, the Verdict of the Scan's commit as Elise computes it, and the worst findings. A Scan that kept no database findings shows them through its findings.json. Name the Scan by its full ID, a prefix of 8 or more characters, or `latest`: run `elise help ids`.",
        flags: &[
            Flag {
                name: "--full",
                short: None,
                value: None,
                default: "off",
                cost: "none",
                about: "Print the whole REPORT.md the Scan wrote, and nothing else. With --json it is the field reportMarkdown.",
            },
            JSON_FLAG,
        ],
        needs: "CLI access from `elise login`, or ELISE_TOKEN (scope read is enough).",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &[
            "elise report latest",
            "elise report SCAN_ID --full",
            "elise report SCAN_ID --json",
            "elise report latest --json | jq -r '.verdict.verdict'   # CI",
        ],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, scan (id, repo, repoId, branch, status queued|running|succeeded|failed|stopped, profile, commit, createdAt, finishedAt, costUsd, runner: its name, error: each or null), summary ({total, severity: {critical, high, medium, low, informational}, needsValidation, new, carried: null when Elise sent no summary and the counts come from findings.json} or null when the Scan has no findings to show), verdict (Elise's Verdict of the Scan's commit, as `verdict` prints it, or null), topFindings (up to 5, worst first, rejected ones left out; each as in `findings`), reportMarkdown with --full. Failure codes: bad_scan_id, scan_not_found, ambiguous_scan (with matches: [{id, repo, status}]), no_report, no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "findings",
        group: "Results",
        summary: "List findings, for one Scan or for the latest Scan of each repo.",
        usage: "elise findings [--scan <id>] [--repo <repo>] [--severity <level>] [--status <status>] [--json]",
        about: "With --scan, every finding of that Scan (an old Scan that kept none in the database shows them through its findings.json). Without it, the open findings of each repo's latest Scan of its default branch, as the dashboard Findings page counts them. Worst first. A finding with no severity needs a person to check by hand.",
        flags: &[
            Flag {
                name: "--scan",
                short: None,
                value: Some("id"),
                default: "none",
                cost: "none",
                about: "Only the findings of this Scan: a full ID, a prefix of 8 or more characters, or `latest`.",
            },
            Flag {
                name: "--repo",
                short: None,
                value: Some("repo"),
                default: "all repos",
                cost: "none",
                about: "Only this repo (URL, owner/name, gitlab:owner/name, ID or `.`). With --scan it also narrows what `latest` or a prefix means.",
            },
            Flag {
                name: "--severity",
                short: None,
                value: Some("level"),
                default: "all",
                cost: "none",
                about: "Only critical, high, medium, low or informational.",
            },
            Flag {
                name: "--status",
                short: None,
                value: Some("status"),
                default: "all",
                cost: "none",
                about: "Only confirmed or needs_validation.",
            },
            JSON_FLAG,
        ],
        needs: "CLI access from `elise login`, or ELISE_TOKEN (scope read is enough).",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &[
            "elise findings --scan latest --severity high",
            "elise findings --repo acme/widgets --status needs_validation",
            "elise findings --scan SCAN_ID --json",
            "elise findings --json | jq '.findings | length'   # CI",
        ],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, scanId (the Scan asked for or null), findings (scanId, repo, fingerprint, status confirmed|needs_validation|rejected, severity or null, title, class, file, line, actor, impact, evidence, fix, needs, triage: {status open|fixed|false_positive|accepted_risk|duplicate, note} or null: each or null; from an old findings.json only scanId, repo, status, severity, title, file and line are set). Failure codes: bad_scan_id, scan_not_found, ambiguous_scan (with matches: [{id, repo, status}]), bad_repo_name, not_a_checkout, repo_not_found, ambiguous_repo (with matches: [{id, name, provider, host}]), no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "files",
        group: "Results",
        summary: "List the files a Scan saved, or save one with `files get`.",
        usage: "elise files <scan-id> [--json] | elise files get <scan-id> <name> [--out <path>] [--json]",
        about: "`files` lists what the Scan saved, with sizes. `files get` writes one file's bytes to standard output, or to --out (a path, or a folder: the file keeps its name there). A file that is not text is not printed to a terminal: add --out or pipe it. With --json and no --out, the text comes as the field content.",
        flags: &[
            Flag {
                name: "--out",
                short: None,
                value: Some("path"),
                default: "standard output",
                cost: "none",
                about: "`files get`: write the file here. An existing file is replaced. A folder gets the file under its own name.",
            },
            JSON_FLAG,
        ],
        needs: "CLI access from `elise login`, or ELISE_TOKEN (scope read is enough).",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &[
            "elise files latest",
            "elise files get latest REPORT.md --out ./report.md",
            "elise files latest --json",
            "elise files get \"$SCAN_ID\" findings.json | jq length   # CI",
        ],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "files: schemaVersion, ok, exitCode, scanId, files (name, sizeBytes, contentType: sizeBytes and contentType are null when Elise sent only the names). files get: schemaVersion, ok, exitCode, scanId, name, bytes, and path with --out or content (the text) without it. Failure codes: bad_scan_id, scan_not_found, ambiguous_scan (with matches: [{id, repo, status}]), file_not_found, binary_to_terminal, binary_needs_out, write_failed, no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "diff",
        group: "Results",
        summary: "Show what changed since the Scan before it on the same branch.",
        usage: "elise diff <scan-id> [--json]",
        about: "The same comparison the Scan page shows: new findings, regressed ones, ones still open, ones the check found gone, and ones that vanished without a check. A Scan with no earlier Scan to compare with says so and exits 0.",
        flags: ONLY_JSON,
        needs: "CLI access from `elise login`, or ELISE_TOKEN (scope read is enough).",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &["elise diff latest", "elise diff SCAN_ID --json", "elise diff latest --json | jq '.new | length'   # CI"],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, scanId, previousScanId (or null), new, stillOpen, regressed, fixed, notRechecked: each a list of {fingerprint, status, severity or null, title, class, file, line}. Failure codes: bad_scan_id, scan_not_found, ambiguous_scan (with matches: [{id, repo, status}]), no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
    },
    Spec {
        name: "verdict",
        group: "Results",
        summary: "Say whether a repo is ready to ship: Elise's Verdict for a commit.",
        usage: "elise verdict <repo> [--commit <sha>] [--json]",
        about: "The ship answer as Elise computes it: pass, fail or cannot_tell, why, how many Scans count, and the open, accepted and dismissed problems. Without --commit it judges the latest succeeded Scan's commit on the default branch (the checkout's branch for `.`). Name the repo as `elise help repos` says.",
        flags: &[
            Flag {
                name: "--commit",
                short: None,
                value: Some("sha"),
                default: "the branch's latest commit",
                cost: "none",
                about: "Judge this commit: 40 hex digits (64 for an upload).",
            },
            JSON_FLAG,
        ],
        needs: "CLI access from `elise login`, or ELISE_TOKEN (scope read is enough).",
        env: &[("ELISE_TOKEN", "CLI access for CI and containers, read only: login and unpair do not manage it.")],
        examples: &[
            "elise verdict acme/widgets",
            "elise verdict . --commit 0123456789abcdef0123456789abcdef01234567",
            "elise verdict acme/widgets --json",
            "elise verdict \"$REPO\" --json | jq -e '.verdict.verdict == \"pass\"'   # CI",
        ],
        exits: &[0, 1, 2, 3, 4, 5],
        json: "schemaVersion, ok, exitCode, repo ({id, name}), branch (the branch judged, or null with --commit), verdict (Elise's answer: verdict pass|fail|cannot_tell, basis, commit, reasons: [{code, message}], scans: {required, counted, ids}, limits: {critical, high, medium}, counts: {critical, high, medium, low, informational, needsValidation}, open, accepted, dismissed: lists of problems with fingerprint, title, severity, class, file, line). Failure codes: bad_repo_name, not_a_checkout, repo_not_found, ambiguous_repo (with matches: [{id, name, provider, host}]), no_commit, no_cli_access, needs_scope, revoked, offline, not_found, refused, unreadable, usage",
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
A Scan id names one Scan. `elise scan show`, `trace`, `stop` and `resume` take it, `elise scans` lists them,
and `elise status` lists the kept folders.
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
