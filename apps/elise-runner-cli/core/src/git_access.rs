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

pub fn message(address: &Address, failure: Failure) -> String {
    let host = &address.host;
    let path = &address.path;
    let fix = login_fix(address);
    match failure {
        Failure::NoLogin => format!("This Runner cannot read {path} on {host}: git has no login for {host}. {fix}"),
        Failure::Rejected => format!(
            "This Runner cannot read {path} on {host}: the login git saved for {host} was rejected (it may have been revoked or expired). {fix}"
        ),
    }
}

pub async fn check(address: &Address, helper: Option<&Helper>) -> Result<(), String> {
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
    let Ok(Ok(output)) = timeout(CHECK_TIMEOUT, command.output()).await else { return Ok(()) };
    if output.status.success() {
        return Ok(());
    }
    match classify(&String::from_utf8_lossy(&output.stderr)) {
        Some(failure) => Err(message(address, failure)),
        None => Ok(()),
    }
}
