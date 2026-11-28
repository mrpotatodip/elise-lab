#[derive(Debug, PartialEq, Default)]
pub struct ScanArgs {
    pub repo: Option<String>,
    pub branch: Option<String>,
    pub profile: Option<String>,
    pub budget: Option<String>,
    pub runner: Option<String>,
    pub timeout: Option<String>,
    pub run: bool,
    pub wait: bool,
    pub yes: bool,
    pub json: bool,
}

const WITH_VALUE: [(&str, &str); 5] = [
    ("--branch", "a branch name"),
    ("--profile", "a profile"),
    ("--budget", "a number of dollars"),
    ("--runner", "a Runner name or ID"),
    ("--timeout", "a time such as 90, 30m or 2h"),
];

pub fn take(rest: &[String], args: &mut ScanArgs) -> Result<Vec<String>, String> {
    let mut kept = Vec::new();
    let mut items = rest.iter();
    while let Some(item) = items.next() {
        let Some((name, about)) = WITH_VALUE.iter().find(|(name, _)| item == name || item.starts_with(&format!("{name}="))) else {
            kept.push(item.clone());
            continue;
        };
        let value = match item.strip_prefix(&format!("{name}=")) {
            Some(value) => Some(value),
            None => items.next().map(String::as_str),
        };
        let Some(value) = value.filter(|value| !value.is_empty() && !value.starts_with("--")) else {
            return Err(format!("`{name}` takes {about}"));
        };
        let slot = match *name {
            "--branch" => &mut args.branch,
            "--profile" => &mut args.profile,
            "--budget" => &mut args.budget,
            "--runner" => &mut args.runner,
            _ => &mut args.timeout,
        };
        *slot = Some(value.to_string());
    }
    Ok(kept)
}
