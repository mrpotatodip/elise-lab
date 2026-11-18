use crate::engine::{client, engine_url, Envelope};
use crate::store::TokenStore;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(tag = "state", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum RunnerStatus {
    // No token on this computer.
    Unpaired,
    // Elise no longer knows the token: the runner was removed.
    Revoked,
    // A token is saved, but Elise could not be reached.
    Offline,
    Connected { name: String, account_name: String },
}

#[derive(Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum RunnerError {
    InvalidCode,
    Unreachable,
    KeychainFailed,
    // Accepting a pairing that is not waiting: the app was restarted, or it was answered twice.
    PairingLost,
}

pub struct Enrolled {
    pub name: String,
    pub account_name: String,
    token: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Identity {
    name: String,
    account_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnrolledAnswer {
    name: String,
    account_name: String,
    token: String,
}

#[derive(Serialize)]
struct EnrollBody<'a> {
    code: &'a str,
}

// Asks Elise who this runner is. Also the proof that the pairing still works.
pub async fn status(store: &dyn TokenStore) -> RunnerStatus {
    let Some(token) = store.token() else {
        return RunnerStatus::Unpaired;
    };
    let answer = client()
        .get(format!("{}/runners/me", engine_url()))
        .bearer_auth(&token)
        .send()
        .await;
    let Ok(response) = answer else {
        return RunnerStatus::Offline;
    };
    match response.status() {
        StatusCode::OK => match response.json::<Envelope<Identity>>().await {
            Ok(envelope) => RunnerStatus::Connected {
                name: envelope.data.name,
                account_name: envelope.data.account_name,
            },
            Err(_) => RunnerStatus::Offline,
        },
        StatusCode::UNAUTHORIZED => {
            store.forget();
            RunnerStatus::Revoked
        }
        _ => RunnerStatus::Offline,
    }
}

pub async fn enroll(code: &str) -> Result<Enrolled, RunnerError> {
    let response = client()
        .post(format!("{}/runners/enroll", engine_url()))
        .json(&EnrollBody { code })
        .send()
        .await
        .map_err(|_| RunnerError::Unreachable)?;
    match response.status() {
        StatusCode::OK => {}
        // 400 is a code that is not even the right shape; 403 is wrong, used or expired.
        StatusCode::FORBIDDEN | StatusCode::BAD_REQUEST => return Err(RunnerError::InvalidCode),
        _ => return Err(RunnerError::Unreachable),
    }
    let enrolled = response
        .json::<Envelope<EnrolledAnswer>>()
        .await
        .map_err(|_| RunnerError::Unreachable)?
        .data;
    Ok(Enrolled {
        name: enrolled.name,
        account_name: enrolled.account_name,
        token: enrolled.token,
    })
}

// Tells Elise to stop trusting a token. True when it did, or already had.
async fn revoke(token: &str) -> bool {
    match client().delete(format!("{}/runners/me", engine_url())).bearer_auth(token).send().await {
        Ok(response) => response.status().is_success() || response.status() == StatusCode::UNAUTHORIZED,
        Err(_) => false,
    }
}

pub async fn accept(store: &dyn TokenStore, enrolled: Enrolled) -> Result<RunnerStatus, RunnerError> {
    if store.save(&enrolled.token).is_err() {
        revoke(&enrolled.token).await;
        return Err(RunnerError::KeychainFailed);
    }
    Ok(RunnerStatus::Connected {
        name: enrolled.name,
        account_name: enrolled.account_name,
    })
}

#[derive(Debug, PartialEq)]
pub enum Replaced {
    Nothing,
    Revoked,
    StillLive,
}

pub async fn accept_replacing(
    store: &dyn TokenStore,
    enrolled: Enrolled,
) -> Result<(RunnerStatus, Replaced), RunnerError> {
    let old = store.token();
    let status = accept(store, enrolled).await?;
    let replaced = match old {
        None => Replaced::Nothing,
        Some(old) if revoke(&old).await => Replaced::Revoked,
        Some(_) => Replaced::StillLive,
    };
    Ok((status, replaced))
}

impl Enrolled {
    pub(crate) fn new(name: String, account_name: String, token: String) -> Enrolled {
        Enrolled { name, account_name, token }
    }

    pub fn into_token(self) -> String {
        self.token
    }
}

pub async fn decline(enrolled: Enrolled) -> RunnerStatus {
    revoke(&enrolled.token).await;
    RunnerStatus::Unpaired
}

// Tells Elise to stop trusting this runner, then forgets the token. If Elise cannot
// be reached the token is kept, so a copy of it is never left alive without a way to retry.
pub async fn unpair(store: &dyn TokenStore) -> Result<RunnerStatus, RunnerError> {
    let Some(token) = store.token() else {
        return Ok(RunnerStatus::Unpaired);
    };
    if !revoke(&token).await {
        return Err(RunnerError::Unreachable);
    }
    store.forget();
    Ok(RunnerStatus::Unpaired)
}
