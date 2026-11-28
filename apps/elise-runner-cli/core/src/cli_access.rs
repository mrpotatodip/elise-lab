use crate::engine::{client, engine_url};
use crate::store::{StoreFailed, TokenStore};
use reqwest::StatusCode;
use serde::Deserialize;

const SCOPES: [&str; 3] = ["read", "start", "admin"];

#[derive(Clone, PartialEq)]
pub struct Held {
    pub scope: Option<String>,
    pub account: Option<String>,
    pub token: String,
}

impl std::fmt::Debug for Held {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.debug_struct("Held").field("scope", &self.scope).field("account", &self.account).field("token", &"[redacted]").finish()
    }
}

#[derive(Deserialize)]
pub struct Grant {
    pub name: String,
    pub scope: String,
    #[serde(rename = "accountId", default)]
    pub account_id: Option<String>,
    pub token: String,
}

impl std::fmt::Debug for Grant {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Grant")
            .field("name", &self.name)
            .field("scope", &self.scope)
            .field("account_id", &self.account_id)
            .field("token", &"[redacted]")
            .finish()
    }
}

#[derive(Debug, PartialEq)]
pub enum AccessStatus {
    None,
    Valid { scope: Option<String> },
    Revoked,
    Offline { scope: Option<String> },
}

fn is_account_id(text: &str) -> bool {
    text.len() == 36 && text.bytes().all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

fn decode(text: &str) -> Held {
    let mut parts = text.splitn(3, ':');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(scope), Some(account), Some(token)) if SCOPES.contains(&scope) && is_account_id(account) => {
            Held { scope: Some(scope.to_string()), account: Some(account.to_string()), token: token.to_string() }
        }
        (Some(scope), Some(token), None) if SCOPES.contains(&scope) => {
            Held { scope: Some(scope.to_string()), account: None, token: token.to_string() }
        }
        _ => Held { scope: None, account: None, token: text.to_string() },
    }
}

pub fn held(store: &dyn TokenStore) -> Option<Held> {
    store.token().map(|text| decode(&text))
}

pub fn save(store: &dyn TokenStore, grant: &Grant) -> Result<(), StoreFailed> {
    match grant.account_id.as_deref().filter(|account| is_account_id(account)) {
        Some(account) => store.save(&format!("{}:{account}:{}", grant.scope, grant.token)),
        None => store.save(&format!("{}:{}", grant.scope, grant.token)),
    }
}

pub async fn status(store: &dyn TokenStore, read_only: bool) -> AccessStatus {
    let Some(held) = held(store) else {
        return AccessStatus::None;
    };
    let answer = client().get(format!("{}/me", engine_url())).bearer_auth(&held.token).send().await;
    let Ok(response) = answer else {
        return AccessStatus::Offline { scope: held.scope };
    };
    match response.status() {
        StatusCode::OK => AccessStatus::Valid { scope: held.scope },
        StatusCode::UNAUTHORIZED => {
            if !read_only {
                store.forget();
            }
            AccessStatus::Revoked
        }
        _ => AccessStatus::Offline { scope: held.scope },
    }
}

#[cfg(test)]
mod tests {
    use super::{decode, Grant, Held};

    const ACCOUNT: &str = "5b0c3f0e-1d2a-4c3b-8e4f-6a7b8c9d0e1f";

    #[test]
    fn reads_the_scope_and_account_in_front_of_a_stored_token() {
        let held = |scope: Option<&str>, account: Option<&str>, token: &str| Held {
            scope: scope.map(String::from),
            account: account.map(String::from),
            token: token.into(),
        };
        assert_eq!(decode("start:elc_abc"), held(Some("start"), None, "elc_abc"));
        assert_eq!(decode(&format!("read:{ACCOUNT}:elc_abc")), held(Some("read"), Some(ACCOUNT), "elc_abc"));
        assert_eq!(decode("elc_abc"), held(None, None, "elc_abc"));
        assert_eq!(decode("odd:elc_abc"), held(None, None, "odd:elc_abc"));
        assert_eq!(decode(&format!("odd:{ACCOUNT}:elc_abc")), held(None, None, &format!("odd:{ACCOUNT}:elc_abc")));
    }

    #[test]
    fn a_token_never_shows_in_debug_output() {
        let grant = Grant { name: "box".into(), scope: "read".into(), account_id: None, token: "elc_secret".into() };
        let held = decode("start:elc_secret");

        assert!(!format!("{grant:?}{held:?}").contains("elc_secret"));
        assert!(format!("{held:?}").contains("[redacted]"));
    }
}
