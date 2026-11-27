use crate::table::{self, Spec, Topic};

#[derive(Debug, PartialEq)]
pub enum Command {
    Pair { code: String, yes: bool, print_token: bool, json: bool },
    Login { no_browser: bool, json: bool },
    Status { json: bool },
    Doctor { hosts: Vec<String>, json: bool },
    Unpair { json: bool },
    Run { once: bool, parallel: usize },
    Resume { scan_id: String, json: bool },
}

pub enum Parsed {
    Command(Command),
    Help,
    Page(&'static Spec),
    Topic(&'static Topic),
    Commands { json: bool },
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
    let wants_help = args.iter().any(|arg| arg == "--help" || arg == "-h");
    if wants_help {
        return match args.first().and_then(|first| table::command(first)) {
            Some(spec) => Parsed::Page(spec),
            None => Parsed::Help,
        };
    }
    if args.iter().any(|arg| arg == "--version" || arg == "-V") {
        return Parsed::Version;
    }
    let Some((command, rest)) = args.split_first() else {
        return Parsed::Usage("no command given".to_string());
    };
    let Some(spec) = table::command(command) else {
        return Parsed::Usage(unknown_command(command));
    };
    let (rest, parallel) = if table::accepts(spec, "--parallel") {
        match take_parallel(rest) {
            Ok(taken) => taken,
            Err(problem) => return Parsed::Usage(problem),
        }
    } else {
        (rest.to_vec(), 1)
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
        ("run", []) => Parsed::Command(Command::Run { once: has("--once"), parallel }),
        ("resume", [scan_id]) => Parsed::Command(Command::Resume { scan_id: scan_id.to_string(), json: has("--json") }),
        ("resume", []) => Parsed::Usage("`resume` needs the Scan id of a kept work folder (`status` lists them)".to_string()),
        ("help", []) => Parsed::Help,
        ("help", [wanted]) => help_for(wanted),
        ("commands", []) => Parsed::Commands { json: has("--json") },
        _ => Parsed::Usage(format!("too many arguments for `{command}`")),
    }
}
