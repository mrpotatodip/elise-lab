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
    Rejected,
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
        "returned error: 403",
    ]) {
        Some(Failure::Rejected)
    } else if has(&["could not read username", "could not read password", "terminal prompts disabled"]) {
        Some(Failure::NoLogin)
    } else {
        None
    }
}

fn cause(host: &str, failure: Failure) -> String {
    match failure {
        Failure::NoLogin => format!("git has no login for {host}"),
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
        Some(failure) => Err(format!("{}. {}", cause(&address.host, failure), login_fix(address))),
        None => Ok(()),
    }
}

pub async fn check(address: &Address, helper: Option<&Helper>) -> Result<(), String> {
    match probe(address, helper).await {
        Some(failure) => Err(message(address, failure)),
        None => Ok(()),
    }
}

async fn probe(address: &Address, helper: Option<&Helper>) -> Option<Failure> {
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
    let Ok(Ok(output)) = timeout(CHECK_TIMEOUT, command.output()).await else { return None };
    if output.status.success() {
        return None;
    }
    classify(&String::from_utf8_lossy(&output.stderr))
}
