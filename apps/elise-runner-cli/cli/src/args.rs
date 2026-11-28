use crate::scan_args::{self, ScanArgs};
use crate::table::{self, Spec, Topic};

#[derive(Debug, PartialEq)]
pub enum Command {
    Pair { code: String, yes: bool, print_token: bool, json: bool },
    Login { no_browser: bool, json: bool },
    Status { json: bool },
    Doctor { hosts: Vec<String>, json: bool },
    Unpair { json: bool },
    Run { once: bool, parallel: usize, json: bool },
    Resume { scan_id: String, json: bool },
    Repos { json: bool },
    Repo { repo: String, json: bool },
    Scan(ScanArgs),
    Scans { repo: Option<String>, json: bool },
    ScanShow { scan_id: String, json: bool },
    Trace { scan_id: String, json: bool },
    Stop { scan_id: String, json: bool },
    ArchivesAdd { app: String, file: String, json: bool },
    ArchivesList { app: String, json: bool },
    ArchivesRemove { app: String, archive: String, yes: bool, json: bool },
    SkillInstall { dir: Option<String>, json: bool },
    Results(crate::results_args::Request),
}

pub enum Parsed {
    Command(Command),
    Help,
    Page(&'static Spec),
    Topic(&'static Topic),
    Commands { json: bool, markdown: bool },
    Completions(String),
    Version,
    Usage(String),
}

pub const MAX_PARALLEL: usize = 3;

fn take_parallel(rest: &[String]) -> Result<(Vec<String>, usize), String> {
    let mut kept = Vec::new();
    let mut parallel = 1;
    let mut items = rest.iter();
    while let Some(item) = items.next() {
        let value = if item == "--parallel" {
            Some(items.next().map(String::as_str).unwrap_or_default())
        } else {
            item.strip_prefix("--parallel=")
        };
        let Some(value) = value else {
            kept.push(item.clone());
            continue;
        };
        parallel = match value.parse::<usize>() {
            Ok(count) if (1..=MAX_PARALLEL).contains(&count) => count,
            _ => return Err(format!("`--parallel` takes a number from 1 to {MAX_PARALLEL}")),
        };
    }
    Ok((kept, parallel))
}

fn take_dir(rest: &[String]) -> Result<(Vec<String>, Option<String>), String> {
    let mut kept = Vec::new();
    let mut dir = None;
    let mut items = rest.iter();
    while let Some(item) = items.next() {
        let value = if item == "--dir" { items.next().map(String::as_str) } else { item.strip_prefix("--dir=") };
        if item != "--dir" && !item.starts_with("--dir=") {
            kept.push(item.clone());
            continue;
        }
        match value {
            Some(value) if !value.is_empty() && !value.starts_with("--") => dir = Some(value.to_string()),
            _ => return Err("`--dir` takes a folder path".to_string()),
        }
    }
    Ok((kept, dir))
}

fn distance(a: &str, b: &str) -> usize {
    let b: Vec<char> = b.chars().collect();
    let mut row: Vec<usize> = (0..=b.len()).collect();
    for (i, x) in a.chars().enumerate() {
        let mut diagonal = row[0];
        row[0] = i + 1;
        for (j, y) in b.iter().enumerate() {
            let above = row[j + 1];
            row[j + 1] = (above + 1).min(row[j] + 1).min(diagonal + usize::from(x != *y));
            diagonal = above;
        }
    }
    row[b.len()]
}

fn unknown_command(command: &str) -> String {
    let closest = table::COMMANDS.iter().map(|spec| (distance(command, spec.name), spec.name)).min();
    match closest {
        Some((gap, name)) if gap <= 2 => format!("unknown command `{command}`. Did you mean `elise {name}`?"),
        _ => format!("unknown command `{command}`"),
    }
}

fn help_for(wanted: &str) -> Parsed {
    if let Some(topic) = table::topic(wanted) {
        return Parsed::Topic(topic);
    }
    match table::command(wanted) {
        Some(spec) => Parsed::Page(spec),
        None => Parsed::Usage(format!("no help for `{wanted}`. Run `elise help` for the commands and topics")),
    }
}

pub fn parse(args: &[String]) -> Parsed {
    if let [first, second, rest @ ..] = args {
        if first == "scan" && second == "show" {
            let renamed: Vec<String> = std::iter::once("scan-show".to_string()).chain(rest.iter().cloned()).collect();
            return parse(&renamed);
        }
        if first == "archives" && matches!(second.as_str(), "add" | "list" | "remove") {
            let renamed: Vec<String> = std::iter::once(format!("archives-{second}")).chain(rest.iter().cloned()).collect();
            return parse(&renamed);
        }
    }
    if args.first().is_some_and(|first| first == "archives") && !args.iter().any(|arg| arg == "--help" || arg == "-h") {
        return Parsed::Usage("`archives` needs a subcommand: `elise archives add`, `list` or `remove`".to_string());
    }
    let wants_help = args.iter().any(|arg| arg == "--help" || arg == "-h");
    if wants_help {
        return match args.iter().find(|arg| !arg.starts_with('-')).and_then(|first| table::command(first)) {
            Some(spec) => Parsed::Page(spec),
            None => Parsed::Help,
        };
    }
    let before_command = args.iter().take_while(|arg| arg.starts_with('-'));
    if before_command.into_iter().any(|arg| arg == "--version" || arg == "-V") {
        return Parsed::Version;
    }
    let Some((command, rest)) = args.split_first() else {
        return Parsed::Usage("no command given".to_string());
    };
    let Some(spec) = table::command(command) else {
        return Parsed::Usage(unknown_command(command));
    };
    if let Some(parsed) = crate::results_args::parse(command, spec, rest) {
        return parsed;
    }
    let (rest, parallel) = if table::accepts(spec, "--parallel") {
        match take_parallel(rest) {
            Ok(taken) => taken,
            Err(problem) => return Parsed::Usage(problem),
        }
    } else {
        (rest.to_vec(), 1)
    };
    let (rest, dir) = if table::accepts(spec, "--dir") {
        match take_dir(&rest) {
            Ok(taken) => taken,
            Err(problem) => return Parsed::Usage(problem),
        }
    } else {
        (rest, None)
    };
    let mut scan_args = ScanArgs::default();
    let rest = if command == "scan" {
        match scan_args::take(&rest, &mut scan_args) {
            Ok(kept) => kept,
            Err(problem) => return Parsed::Usage(problem),
        }
    } else {
        rest
    };
    let (rest, repo) = if table::accepts(spec, "--repo") {
        match crate::scans::take_repo(&rest) {
            Ok(taken) => taken,
            Err(problem) => return Parsed::Usage(problem),
        }
    } else {
        (rest, None)
    };
    let (flags, positional): (Vec<&String>, Vec<&String>) = rest.iter().partition(|arg| arg.starts_with('-'));
    if let Some(flag) = flags.iter().find(|flag| !table::accepts(spec, flag)) {
        return Parsed::Usage(format!("`{command}` does not take `{flag}`"));
    }
    let has = |name: &str| flags.iter().any(|flag| flag.as_str() == name);
    match (command.as_str(), positional.as_slice()) {
        ("pair", [code]) => Parsed::Command(Command::Pair {
            code: code.to_string(),
            yes: has("--yes") || has("-y"),
            print_token: has("--print-token"),
            json: has("--json"),
        }),
        ("pair", []) => Parsed::Usage("`pair` needs the pairing code from Elise".to_string()),
        ("login", []) => Parsed::Command(Command::Login { no_browser: has("--no-browser"), json: has("--json") }),
        ("status", []) => Parsed::Command(Command::Status { json: has("--json") }),
        ("doctor", hosts) => {
            Parsed::Command(Command::Doctor { hosts: hosts.iter().map(|host| host.to_ascii_lowercase()).collect(), json: has("--json") })
        }
        ("unpair", []) => Parsed::Command(Command::Unpair { json: has("--json") }),
        ("run", []) => Parsed::Command(Command::Run { once: has("--once"), parallel, json: has("--json") }),
        ("resume", [scan_id]) => Parsed::Command(Command::Resume { scan_id: scan_id.to_string(), json: has("--json") }),
        ("resume", []) => Parsed::Usage("`resume` needs a Scan: a full ID, a prefix of 8 or more characters, or `latest`".to_string()),
        ("repos", []) => Parsed::Command(Command::Repos { json: has("--json") }),
        ("repo", [repo]) => Parsed::Command(Command::Repo { repo: repo.to_string(), json: has("--json") }),
        ("repo", []) => Parsed::Usage("`repo` needs a repo: a URL, owner/name, gitlab:owner/name, an ID or `.`".to_string()),
        ("scan", [] | [_]) => {
            scan_args.repo = positional.first().map(|repo| repo.to_string());
            scan_args.run = has("--run");
            scan_args.wait = has("--wait");
            scan_args.yes = has("--yes") || has("-y");
            scan_args.json = has("--json");
            Parsed::Command(Command::Scan(scan_args))
        }
        ("scans", []) => Parsed::Command(Command::Scans { repo, json: has("--json") }),
        ("scan-show", [scan_id]) => Parsed::Command(Command::ScanShow { scan_id: scan_id.to_string(), json: has("--json") }),
        ("scan-show", []) => {
            Parsed::Usage("`scan show` needs a Scan: a full ID, a prefix of 8 or more characters, or `latest`".to_string())
        }
        ("trace", [scan_id]) => Parsed::Command(Command::Trace { scan_id: scan_id.to_string(), json: has("--json") }),
        ("trace", []) => Parsed::Usage("`trace` needs a Scan: a full ID, a prefix of 8 or more characters, or `latest`".to_string()),
        ("stop", [scan_id]) => Parsed::Command(Command::Stop { scan_id: scan_id.to_string(), json: has("--json") }),
        ("stop", []) => Parsed::Usage("`stop` needs a Scan: a full ID, a prefix of 8 or more characters, or `latest`".to_string()),
        ("archives-add", [app, file]) => {
            Parsed::Command(Command::ArchivesAdd { app: app.to_string(), file: file.to_string(), json: has("--json") })
        }
        ("archives-add", _) => {
            Parsed::Usage("`archives add` needs an upload app and a .zip file: `elise archives add <app> <file>`".to_string())
        }
        ("archives-list", [app]) => Parsed::Command(Command::ArchivesList { app: app.to_string(), json: has("--json") }),
        ("archives-list", _) => Parsed::Usage("`archives list` needs an upload app: a name or an ID".to_string()),
        ("archives-remove", [app, archive]) => Parsed::Command(Command::ArchivesRemove {
            app: app.to_string(),
            archive: archive.to_string(),
            yes: has("--yes") || has("-y"),
            json: has("--json"),
        }),
        ("archives-remove", _) => {
            Parsed::Usage("`archives remove` needs an upload app and a zip: `elise archives remove <app> <label or ID>`".to_string())
        }
        ("help", []) => Parsed::Help,
        ("help", [wanted]) => help_for(wanted),
        ("completions", [shell]) => Parsed::Completions(shell.to_string()),
        ("completions", []) => Parsed::Usage(format!("`completions` needs a shell: {}", crate::completions::supported())),
        ("skill", [sub]) if sub.as_str() == "install" => Parsed::Command(Command::SkillInstall { dir, json: has("--json") }),
        ("skill", []) => Parsed::Usage("`skill` needs a subcommand: `elise skill install`".to_string()),
        ("skill", [other, ..]) if other.as_str() != "install" => {
            Parsed::Usage(format!("unknown `skill` subcommand `{other}`. Use `elise skill install`"))
        }
        ("commands", []) if has("--json") && has("--markdown") => {
            Parsed::Usage("`commands` takes `--json` or `--markdown`, not both".to_string())
        }
        ("commands", []) => Parsed::Commands { json: has("--json"), markdown: has("--markdown") },
        _ => Parsed::Usage(format!("too many arguments for `{command}`")),
    }
}
