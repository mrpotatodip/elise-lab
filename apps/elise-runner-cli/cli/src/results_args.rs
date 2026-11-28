use crate::args::Parsed;
use crate::table::{self, Spec};

#[derive(Debug, PartialEq)]
pub enum Request {
    Report { scan: String, full: bool, json: bool },
    Findings { scan: Option<String>, repo: Option<String>, severity: Option<String>, status: Option<String>, json: bool },
    Files { scan: String, json: bool },
    FilesGet { scan: String, name: String, out: Option<String>, json: bool },
    Diff { scan: String, json: bool },
    Verdict { repo: String, commit: Option<String>, json: bool },
}

const SEVERITIES: [&str; 5] = ["critical", "high", "medium", "low", "informational"];
const STATUSES: [&str; 2] = ["confirmed", "needs_validation"];
pub const COMMANDS: [&str; 5] = ["report", "findings", "files", "diff", "verdict"];

struct Taken {
    positional: Vec<String>,
    switches: Vec<String>,
    values: Vec<(String, String)>,
}

impl Taken {
    fn has(&self, name: &str) -> bool {
        self.switches.iter().any(|switch| switch == name)
    }

    fn value(&self, name: &str) -> Option<String> {
        self.values.iter().find(|(known, _)| known == name).map(|(_, value)| value.clone())
    }
}

fn take(spec: &Spec, rest: &[String]) -> Result<Taken, String> {
    let mut taken = Taken { positional: Vec::new(), switches: Vec::new(), values: Vec::new() };
    let mut items = rest.iter();
    while let Some(item) = items.next() {
        if !item.starts_with('-') {
            taken.positional.push(item.clone());
            continue;
        }
        let (name, inline) = match item.split_once('=') {
            Some((name, value)) => (name, Some(value.to_string())),
            None => (item.as_str(), None),
        };
        let Some(flag) = table::flags(spec).find(|known| known.name == name) else {
            return Err(format!("`{}` does not take `{item}`", spec.name));
        };
        if flag.value.is_none() {
            taken.switches.push(name.to_string());
            continue;
        }
        let value = match inline {
            Some(value) => Some(value),
            None => items.next().filter(|next| !next.starts_with("--")).cloned(),
        };
        match value.filter(|value| !value.is_empty()) {
            Some(value) => taken.values.push((name.to_string(), value)),
            None => return Err(format!("`{name}` takes a value")),
        }
    }
    Ok(taken)
}

fn one_of(taken: &Taken, flag: &str, allowed: &[&str]) -> Result<Option<String>, String> {
    match taken.value(flag) {
        Some(value) if !allowed.contains(&value.as_str()) => Err(format!("`{flag}` takes one of: {}", allowed.join(", "))),
        other => Ok(other),
    }
}

fn commit_of(taken: &Taken) -> Result<Option<String>, String> {
    match taken.value("--commit") {
        Some(commit) if !matches!(commit.len(), 40 | 64) || !commit.chars().all(|character| character.is_ascii_hexdigit()) => {
            Err("`--commit` takes a full commit: 40 hex digits (64 for an upload)".to_string())
        }
        other => Ok(other.map(|commit| commit.to_ascii_lowercase())),
    }
}

fn file_name_of(name: &str) -> Result<String, String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.starts_with('.') {
        return Err(format!("`{name}` is not a file name: `elise files <scan-id>` lists them"));
    }
    Ok(name.to_string())
}

fn build(command: &str, taken: Taken) -> Result<Request, String> {
    let json = taken.has("--json");
    let positional: Vec<&str> = taken.positional.iter().map(String::as_str).collect();
    match (command, positional.as_slice()) {
        ("report", [scan]) => Ok(Request::Report { scan: scan.to_string(), full: taken.has("--full"), json }),
        ("report", []) => Err("`report` needs a Scan: a Scan ID, a prefix of 8 or more characters, or `latest`".to_string()),
        ("findings", []) => Ok(Request::Findings {
            scan: taken.value("--scan"),
            repo: taken.value("--repo"),
            severity: one_of(&taken, "--severity", &SEVERITIES)?,
            status: one_of(&taken, "--status", &STATUSES)?,
            json,
        }),
        ("files", ["get", scan, name]) => {
            Ok(Request::FilesGet { scan: scan.to_string(), name: file_name_of(name)?, out: taken.value("--out"), json })
        }
        ("files", ["get", ..]) => Err("`files get` needs a Scan and a file name: `elise files get <scan-id> <name>`".to_string()),
        ("files", [scan]) => Ok(Request::Files { scan: scan.to_string(), json }),
        ("files", []) => Err("`files` needs a Scan: a Scan ID, a prefix of 8 or more characters, or `latest`".to_string()),
        ("diff", [scan]) => Ok(Request::Diff { scan: scan.to_string(), json }),
        ("diff", []) => Err("`diff` needs a Scan: a Scan ID, a prefix of 8 or more characters, or `latest`".to_string()),
        ("verdict", [repo]) => Ok(Request::Verdict { repo: repo.to_string(), commit: commit_of(&taken)?, json }),
        ("verdict", []) => Err("`verdict` needs a repo: a URL, owner/name, gitlab:owner/name, an ID or `.`".to_string()),
        _ => Err(format!("too many arguments for `{command}`")),
    }
}

pub fn parse(command: &str, spec: &Spec, rest: &[String]) -> Option<Parsed> {
    if !COMMANDS.contains(&command) {
        return None;
    }
    let outcome = take(spec, rest).and_then(|taken| build(command, taken));
    Some(match outcome {
        Ok(request) => Parsed::Command(crate::args::Command::Results(request)),
        Err(problem) => Parsed::Usage(problem),
    })
}
