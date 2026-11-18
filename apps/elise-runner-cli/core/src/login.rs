use crate::engine::{client, engine_url, Envelope};
use crate::pairing::Enrolled;
use crate::scan::Stop;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::{sleep, Instant};

const CHECK_EVERY: Duration = Duration::from_secs(5);
const GIVE_UP_AFTER: Duration = Duration::from_secs(10 * 60);
const NAME_MAX: usize = 60;
const FALLBACK_NAME: &str = "elise-runner";

#[derive(Debug, PartialEq)]
pub enum LoginError {
    Unsupported,
    Unreachable,
}

pub enum Waited {
    Approved(Enrolled),
    Cancelled,
    TimedOut,
    Refused,
}

pub struct StartedLogin {
    pub user_code: String,
    pub verification_url: String,
    device_code: String,
}

#[derive(Serialize)]
struct StartBody<'a> {
    name: String,
    os: &'a str,
    cpu: &'a str,
    version: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartedAnswer {
    user_code: String,
    verification_url: String,
    device_code: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckBody<'a> {
    device_code: &'a str,
}

#[derive(Deserialize)]
#[serde(tag = "status", rename_all = "lowercase", rename_all_fields = "camelCase")]
enum Check {
    Pending,
    Approved { name: String, account_name: String, token: String },
}

enum Checked {
    Pending,
    Approved(Enrolled),
    Refused,
}

fn suggested_name() -> String {
    let named = std::process::Command::new("hostname")
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|name| name.trim().chars().take(NAME_MAX).collect::<String>())
        .filter(|name| !name.is_empty());
    named.unwrap_or_else(|| FALLBACK_NAME.to_string())
}

pub async fn start(version: &str) -> Result<StartedLogin, LoginError> {
    let body = StartBody { name: suggested_name(), os: std::env::consts::OS, cpu: std::env::consts::ARCH, version };
    let response = client()
        .post(format!("{}/runners/login/start", engine_url()))
        .json(&body)
        .send()
        .await
        .map_err(|_| LoginError::Unreachable)?;
    match response.status() {
        StatusCode::OK => {}
        StatusCode::NOT_FOUND => return Err(LoginError::Unsupported),
        _ => return Err(LoginError::Unreachable),
    }
    let started = response
        .json::<Envelope<StartedAnswer>>()
        .await
        .map_err(|_| LoginError::Unreachable)?
        .data;
    Ok(StartedLogin {
        user_code: started.user_code,
        verification_url: started.verification_url,
        device_code: started.device_code,
    })
}

async fn check(login: &StartedLogin) -> Checked {
    let answer = client()
        .post(format!("{}/runners/login/check", engine_url()))
        .json(&CheckBody { device_code: &login.device_code })
        .send()
        .await;
    let Ok(response) = answer else {
        return Checked::Pending;
    };
    match response.status() {
        StatusCode::OK => match response.json::<Envelope<Check>>().await {
            Ok(Envelope { data: Check::Approved { name, account_name, token } }) => {
                Checked::Approved(Enrolled::new(name, account_name, token))
            }
            _ => Checked::Pending,
        },
        StatusCode::FORBIDDEN => Checked::Refused,
        _ => Checked::Pending,
    }
}

fn check_every() -> Duration {
    #[cfg(debug_assertions)]
    if let Some(millis) = std::env::var("ELISE_LOGIN_CHECK_MS").ok().and_then(|text| text.parse().ok()) {
        return Duration::from_millis(millis);
    }
    CHECK_EVERY
}

pub async fn wait(login: &StartedLogin, stop: &Stop) -> Waited {
    let give_up_at = Instant::now() + GIVE_UP_AFTER;
    loop {
        tokio::select! {
            _ = sleep(check_every()) => {}
            _ = stop.stopped() => return Waited::Cancelled,
        }
        let checked = tokio::select! {
            checked = check(login) => checked,
            _ = stop.stopped() => return Waited::Cancelled,
        };
        match checked {
            Checked::Approved(enrolled) => return Waited::Approved(enrolled),
            Checked::Refused => return Waited::Refused,
            Checked::Pending if Instant::now() >= give_up_at => return Waited::TimedOut,
            Checked::Pending => {}
        }
    }
}
