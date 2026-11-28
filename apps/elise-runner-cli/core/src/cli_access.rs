use crate::engine::{client, engine_url};
use crate::store::{StoreFailed, TokenStore};
use reqwest::StatusCode;
use serde::Deserialize;

const SCOPES: [&str; 3] = ["read", "start", "admin"];

#[derive(Debug, Clone, PartialEq)]
pub struct Held {
    pub scope: Option<String>,
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct Grant {
    pub name: String,
    pub scope: String,
    pub token: String,
}

#[derive(Debug, PartialEq)]
pub enum AccessStatus {
    None,
    Valid { scope: Option<String> },
    Revoked,
    Offline { scope: Option<String> },
}

fn decode(text: &str) -> Held {
    match text.split_once(':') {
        Some((scope, token)) if SCOPES.contains(&scope) => Held { scope: Some(scope.to_string()), token: token.to_string() },
        _ => Held { scope: None, token: text.to_string() },
    }
}

pub fn held(store: &dyn TokenStore) -> Option<Held> {
    store.token().map(|text| decode(&text))
}

pub fn save(store: &dyn TokenStore, grant: &Grant) -> Result<(), StoreFailed> {
    store.save(&format!("{}:{}", grant.scope, grant.token))
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
    use super::{decode, Held};

    #[test]
    fn reads_the_scope_in_front_of_a_stored_token() {
        assert_eq!(decode("start:elc_abc"), Held { scope: Some("start".into()), token: "elc_abc".into() });
        assert_eq!(decode("elc_abc"), Held { scope: None, token: "elc_abc".into() });
        assert_eq!(decode("odd:elc_abc"), Held { scope: None, token: "odd:elc_abc".into() });
    }
}
