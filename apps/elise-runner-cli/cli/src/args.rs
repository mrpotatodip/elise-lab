#[derive(Debug, PartialEq)]
pub enum Command {
    Pair { code: String, yes: bool, print_token: bool },
    Login { no_browser: bool },
    Status,
    Unpair,
    Run { once: bool },
}

#[derive(Debug, PartialEq)]
pub enum Parsed {
    Command(Command),
    Help,
    Version,
    Usage(String),
}

pub const HELP: &str = "\
elise-runner: the headless Elise Runner. It runs Scans started in Elise on this computer.

Usage:
  elise-runner pair <code> [--yes] [--print-token]
  elise-runner login [--no-browser]
  elise-runner status
  elise-runner run [--once]
  elise-runner unpair
  elise-runner --help | --version

Commands:
  pair <code>     Pair this computer with an Elise account, using a one-time code from Elise.
                  Shows the account and the Runner name and asks to confirm.
    --yes         Accept without asking.
    --print-token Print the token once on standard output and save nothing, to give it to
                  ELISE_RUNNER_TOKEN elsewhere. The token is a credential: treat it as a password.
  login           Connect this computer to an Elise account through the browser, with no code.
                  Prints a link and a code, opens the link when this computer has a desktop
                  session, and waits up to 10 minutes for you to approve it in Elise.
    --no-browser  Only print the link and the code.
  status          Say whether this Runner is unpaired, connected, revoked or offline, and where
                  its token is kept.
  run             Claim and run Scans until stopped.
    --once        Claim at most one Scan, run it and exit.
  unpair          Tell Elise to drop this Runner's token, then forget it.

Where the token is kept, in order:
  1. ELISE_RUNNER_TOKEN, if set. Read only: pair, login and unpair do not manage it.
  2. The system keychain, under a service name of its own (not the desktop app's).
  3. When there is no keychain service, a file in your config folder only you can read.

Settings:
  A file settings.json in the same config folder lists the GitLab servers your company runs
  that this Runner may clone from, for example {\"gitlabHosts\": [\"git.example.com\"]}.
  github.com and gitlab.com need no entry. A Scan on any other host is refused, whatever Elise
  sends, and the file is read again for every Scan.

Exit codes:
  0  success; status: connected
  1  an error
  2  bad command-line usage
  3  unpaired
  4  revoked (Elise rejected the token)
  5  offline (Elise could not be reached)
  6  run --once: nothing to claim
";

pub fn parse(args: &[String]) -> Parsed {
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        return Parsed::Help;
    }
    if args.iter().any(|arg| arg == "--version" || arg == "-V") {
        return Parsed::Version;
    }
    let Some((command, rest)) = args.split_first() else {
        return Parsed::Usage("no command given".to_string());
    };
    let (flags, positional): (Vec<&String>, Vec<&String>) = rest.iter().partition(|arg| arg.starts_with('-'));
    let allowed: &[&str] = match command.as_str() {
        "pair" => &["--yes", "-y", "--print-token"],
        "login" => &["--no-browser"],
        "run" => &["--once"],
        "status" | "unpair" => &[],
        "help" => return Parsed::Help,
        other => return Parsed::Usage(format!("unknown command `{other}`")),
    };
    if let Some(flag) = flags.iter().find(|flag| !allowed.contains(&flag.as_str())) {
        return Parsed::Usage(format!("`{command}` does not take `{flag}`"));
    }
    let has = |name: &str| flags.iter().any(|flag| flag.as_str() == name);
    match (command.as_str(), positional.as_slice()) {
        ("pair", [code]) => Parsed::Command(Command::Pair {
            code: code.to_string(),
            yes: has("--yes") || has("-y"),
            print_token: has("--print-token"),
        }),
        ("pair", []) => Parsed::Usage("`pair` needs the pairing code from Elise".to_string()),
        ("login", []) => Parsed::Command(Command::Login { no_browser: has("--no-browser") }),
        ("status", []) => Parsed::Command(Command::Status),
        ("unpair", []) => Parsed::Command(Command::Unpair),
        ("run", []) => Parsed::Command(Command::Run { once: has("--once") }),
        _ => Parsed::Usage(format!("too many arguments for `{command}`")),
    }
}
