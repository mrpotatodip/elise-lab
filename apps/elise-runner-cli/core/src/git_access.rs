use crate::git_token::Helper;
use crate::providers::{login_fix, Address};
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

const CHECK_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Failure {
    NoLogin,
    Forbidden,
    Rejected,
}

#[derive(Debug)]
enum Probe {
    Reachable,
    Login(Failure),
    Other(String),
}

pub fn classify(stderr: &str) -> Option<Failure> {
    let text = stderr.to_ascii_lowercase();
    let has = |needles: &[&str]| needles.iter().any(|needle| text.contains(needle));
    if has(&[
        "authentication failed",
        "invalid username or password",
        "invalid credentials",
        "http basic: access denied",
        "returned error: 401",
    ]) {
        Some(Failure::Rejected)
    } else if has(&["returned error: 403"]) {
        Some(Failure::Forbidden)
    } else if has(&["could not read username", "could not read password", "terminal prompts disabled"]) {
        Some(Failure::NoLogin)
    } else {
        None
    }
}

fn cause(host: &str, failure: Failure) -> String {
    match failure {
        Failure::NoLogin => format!("git has no login for {host}"),
        Failure::Forbidden => format!("git has no login for {host} that can read this repository"),
        Failure::Rejected => format!("the login git saved for {host} was rejected (it may have been revoked or expired)"),
    }
}

pub fn message(address: &Address, failure: Failure) -> String {
    let (host, path) = (&address.host, &address.path);
    format!("This Runner cannot read {path} on {host}: {}. {}", cause(host, failure), login_fix(address))
}

pub async fn check_host(address: &Address) -> Result<(), String> {
    let helper = Helper::for_host("doctor", &address.host)?;
    match probe(address, helper.as_ref()).await {
        Probe::Reachable => Ok(()),
        Probe::Login(failure) => Err(format!("{}. {}", cause(&address.host, failure), login_fix(address))),
        Probe::Other(detail) => Err(format!("git could not reach {}: {detail}", address.host)),
    }
}

pub async fn check(address: &Address, helper: Option<&Helper>) -> Result<(), String> {
    match probe(address, helper).await {
        Probe::Login(failure) => Err(message(address, failure)),
        Probe::Reachable | Probe::Other(_) => Ok(()),
    }
}

fn answered_not_found(stderr: &str) -> bool {
    let text = stderr.to_ascii_lowercase();
    text.contains("repository not found") || text.contains("could not be found") || text.contains("returned error: 404")
}

fn tail(stderr: &str) -> String {
    let lines: Vec<&str> = stderr.lines().map(str::trim).filter(|line| !line.is_empty()).collect();
    let start = lines.len().saturating_sub(3);
    lines[start..].join(" ")
}

async fn probe(address: &Address, helper: Option<&Helper>) -> Probe {
    let mut command = Command::new("git");
    command
        .args(["ls-remote", "--heads", "--", &address.clone_url])
        .env("GIT_ALLOW_PROTOCOL", "https")
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .kill_on_drop(true);
    if let Some(helper) = helper {
        helper.apply(&mut command);
    }
    let output = match timeout(CHECK_TIMEOUT, command.output()).await {
        Err(_) => return Probe::Other(format!("git did not answer within {} seconds", CHECK_TIMEOUT.as_secs())),
        Ok(Err(error)) => return Probe::Other(error.to_string()),
        Ok(Ok(output)) => output,
    };
    if output.status.success() {
        return Probe::Reachable;
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    match classify(&stderr) {
        Some(failure) => Probe::Login(failure),
        None if answered_not_found(&stderr) => Probe::Reachable,
        None => Probe::Other(tail(&stderr)),
    }
}
