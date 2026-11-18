// Pairing with Elise. Enroll, accept and decline are separate calls: the desktop app holds an
// enrolled pairing in memory until the person presses Connect, a terminal program answers in one
// run. The token never leaves Rust: it goes from Elise to the store and back to Elise.

use crate::engine::{client, engine_url, Envelope};
use crate::store::TokenStore;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

// What the Runner is to Elise. Serialized as `{ "state": "connected", "name": ..., "accountName": ... }`.
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

// Why pairing or disconnecting failed. The desktop page turns each code into a sentence.
#[derive(Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum RunnerError {
    InvalidCode,
    Unreachable,
    KeychainFailed,
    // Accepting a pairing that is not waiting: the app was restarted, or it was answered twice.
    PairingLost,
}

// A token Elise has issued for a code, not accepted yet: it is in no store, so no Scan can run on
// it. The account that made the code and the name it gave this Runner are what the person is asked
// to confirm. A code can be handed to someone by a stranger, so it is `accept` or `decline`, never
// silently kept.
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

// Asks Elise who this runner is. Also the proof that the pairing still works. A token Elise
// rejects is forgotten.
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

// Trades a pairing code for a token, held in the `Enrolled` until it is accepted or declined.
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

// The person accepted the account: the token goes to the store and the work loop may use it. A
// token the store cannot keep is revoked, so it is not left alive.
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

// The person refused. Elise is told to drop the token; if it cannot be reached the token is
// dropped here anyway, and a token nobody holds works for nobody. The runner then shows in the
// account's list until an admin removes it.
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
    let response = client()
        .delete(format!("{}/runners/me", engine_url()))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|_| RunnerError::Unreachable)?;
    // 401 means Elise already dropped it, which is what we wanted.
    match response.status() {
        StatusCode::OK | StatusCode::UNAUTHORIZED => {
            store.forget();
            Ok(RunnerStatus::Unpaired)
        }
        _ => Err(RunnerError::Unreachable),
    }
}
