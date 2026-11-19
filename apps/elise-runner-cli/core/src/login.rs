use crate::engine::{client, engine_url, Envelope};
use crate::pairing::Enrolled;
use crate::scan::Stop;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::{sleep, Instant};

const CHECK_EVERY: Duration = Duration::from_secs(5);
const FALLBACK_LIFETIME: Duration = Duration::from_secs(10 * 60);
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
    Expired,
    Denied,
    Refused,
}

pub struct StartedLogin {
    pub user_code: String,
    pub verification_url: String,
    device_code: String,
    lifetime: Duration,
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
    expires_at: Option<String>,
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
    Approved {
        name: String,
        account_name: String,
        token: String,
    },
    Denied,
    Expired,
    #[serde(rename = "slow_down")]
    SlowDown {
        interval: u64,
    },
}

enum Checked {
    Pending,
    Denied,
    Expired,
    SlowDown(Duration),
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
    let response =
        client().post(format!("{}/runners/login/start", engine_url())).json(&body).send().await.map_err(|_| LoginError::Unreachable)?;
    match response.status() {
        StatusCode::OK => {}
        StatusCode::NOT_FOUND => return Err(LoginError::Unsupported),
        _ => return Err(LoginError::Unreachable),
    }
    let started = response.json::<Envelope<StartedAnswer>>().await.map_err(|_| LoginError::Unreachable)?.data;
    let lifetime = started
        .expires_at
        .as_deref()
        .and_then(unix_seconds)
        .map(|expires| Duration::from_secs(expires.saturating_sub(now_unix_seconds()).max(0) as u64))
        .unwrap_or(FALLBACK_LIFETIME);
    Ok(StartedLogin {
        user_code: started.user_code,
        verification_url: started.verification_url,
        device_code: started.device_code,
        lifetime,
    })
}

async fn check(login: &StartedLogin) -> Checked {
    let answer =
        client().post(format!("{}/runners/login/check", engine_url())).json(&CheckBody { device_code: &login.device_code }).send().await;
    let Ok(response) = answer else {
        return Checked::Pending;
    };
    match response.status() {
        StatusCode::OK => match response.json::<Envelope<Check>>().await {
            Ok(Envelope { data: Check::Approved { name, account_name, token } }) => {
                Checked::Approved(Enrolled::new(name, account_name, token))
            }
            Ok(Envelope { data: Check::Denied }) => Checked::Denied,
            Ok(Envelope { data: Check::Expired }) => Checked::Expired,
            Ok(Envelope { data: Check::SlowDown { interval } }) => Checked::SlowDown(Duration::from_secs(interval)),
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

// -----
// The seconds since 1970 of an ISO time like 2026-11-11T09:10:00.000Z,
// which is how the engine sends the code's expiry. Anything else is None.
// -----
fn unix_seconds(text: &str) -> Option<i64> {
    let (date, time) = text.strip_suffix('Z')?.split_once('T')?;
    let mut date = date.split('-').map(|part| part.parse::<i64>().ok());
    let (year, month, day) = (date.next()??, date.next()??, date.next()??);
    let time = time.split('.').next()?;
    let mut time = time.split(':').map(|part| part.parse::<i64>().ok());
    let (hour, minute, second) = (time.next()??, time.next()??, time.next()??);
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let day_of_year = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    let days = era * 146_097 + day_of_era - 719_468;
    Some(days * 86_400 + hour * 3600 + minute * 60 + second)
}

fn now_unix_seconds() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|elapsed| elapsed.as_secs() as i64).unwrap_or(0)
}

// -----
// The wait ends when the engine says denied or expired, or when the
// code's own expiry has passed. A "slow down" lengthens the time
// between checks to the interval the engine names, never shortens it.
// -----
pub async fn wait(login: &StartedLogin, stop: &Stop) -> Waited {
    let give_up_at = Instant::now() + login.lifetime;
    let mut every = check_every();
    loop {
        tokio::select! {
            _ = sleep(every) => {}
            _ = stop.stopped() => return Waited::Cancelled,
        }
        let checked = tokio::select! {
            checked = check(login) => checked,
            _ = stop.stopped() => return Waited::Cancelled,
        };
        match checked {
            Checked::Approved(enrolled) => return Waited::Approved(enrolled),
            Checked::Refused => return Waited::Refused,
            Checked::Denied => return Waited::Denied,
            Checked::Expired => return Waited::Expired,
            Checked::SlowDown(interval) => every = every.max(interval),
            Checked::Pending => {}
        }
        if Instant::now() >= give_up_at {
            return Waited::Expired;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::unix_seconds;

    #[test]
    fn reads_the_engines_iso_time() {
        assert_eq!(unix_seconds("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(unix_seconds("2026-11-11T09:10:00.000Z"), Some(1_794_388_200));
        assert_eq!(unix_seconds("2000-03-01T00:00:01Z"), Some(951_868_801));
        assert_eq!(unix_seconds("tomorrow"), None);
    }
}
