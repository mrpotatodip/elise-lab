use crate::cli_access::{self, Held};
use crate::engine::{client, engine_url, Envelope, Refusal};
use crate::store::TokenStore;
use reqwest::{Method, StatusCode};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

const UPLOAD_TIMEOUT: Duration = Duration::from_secs(300);
pub const SCOPE_REFUSED: &str = "This CLI access cannot do this";
const OTHER_ACCOUNT: &str = "This CLI access belongs to another account";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    Read,
    Start,
}

impl Scope {
    pub fn name(self) -> &'static str {
        match self {
            Scope::Read => "read",
            Scope::Start => "start",
        }
    }

    fn covered_by(self, held: &str) -> bool {
        match held {
            "read" => self == Scope::Read,
            "start" | "admin" => true,
            _ => false,
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum Denied {
    NoAccess,
    Revoked,
    Offline,
    Scope { needed: Scope, held: Option<String> },
    NotFound(String),
    Refused(String),
    Unreadable,
}

pub struct EngineClient<'a> {
    http: reqwest::Client,
    held: Held,
    tokens: &'a dyn TokenStore,
    read_only: bool,
    account: Mutex<Option<String>>,
}

#[derive(Deserialize)]
struct Me {
    accounts: Vec<MeAccount>,
}

#[derive(Deserialize)]
struct MeAccount {
    id: String,
}

fn encode(text: &str) -> String {
    text.bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (byte as char).to_string(),
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn with_query(path: &str, query: &[(&str, String)]) -> String {
    if query.is_empty() {
        return path.to_string();
    }
    let pairs: Vec<String> = query.iter().map(|(name, value)| format!("{name}={}", encode(value))).collect();
    format!("{path}?{}", pairs.join("&"))
}

impl<'a> EngineClient<'a> {
    pub fn open(tokens: &'a dyn TokenStore, read_only: bool, needed: Scope) -> Result<EngineClient<'a>, Denied> {
        let held = cli_access::held(tokens).ok_or(Denied::NoAccess)?;
        if let Some(scope) = &held.scope {
            if !needed.covered_by(scope) {
                return Err(Denied::Scope { needed, held: held.scope });
            }
        }
        let account = Mutex::new(held.account.clone());
        Ok(EngineClient { http: client(), held, tokens, read_only, account })
    }

    pub fn scope(&self) -> Option<&str> {
        self.held.scope.as_deref()
    }

    pub async fn get<T: DeserializeOwned>(&self, path: &str, query: &[(&str, String)]) -> Result<T, Denied> {
        self.send(Method::GET, &with_query(path, query), None).await
    }

    pub async fn post<T: DeserializeOwned>(&self, path: &str, body: &Value) -> Result<T, Denied> {
        self.send(Method::POST, path, Some(body)).await
    }

    pub async fn delete<T: DeserializeOwned>(&self, path: &str) -> Result<T, Denied> {
        self.send(Method::DELETE, path, None).await
    }

    pub async fn post_file<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
        file: &Path,
        content_type: &str,
    ) -> Result<T, Denied> {
        let path = with_query(path, query);
        let path = path.as_str();
        self.across(|id| async move {
            let unreadable = |_| Denied::Refused("The file could not be read".to_string());
            let opened = tokio::fs::File::open(file).await.map_err(unreadable)?;
            let size = opened.metadata().await.map_err(unreadable)?.len();
            let request = self
                .http
                .post(format!("{}{path}", engine_url()))
                .bearer_auth(&self.held.token)
                .header("x-account-id", id)
                .header(reqwest::header::CONTENT_TYPE, content_type)
                .header(reqwest::header::CONTENT_LENGTH, size)
                .timeout(UPLOAD_TIMEOUT)
                .body(reqwest::Body::from(opened));
            let response = self.finish(request, Scope::Start).await?;
            response.json::<Envelope<T>>().await.map(|envelope| envelope.data).map_err(|_| Denied::Unreadable)
        })
        .await
    }

    pub async fn get_bytes(&self, path: &str, query: &[(&str, String)]) -> Result<Vec<u8>, Denied> {
        let path = with_query(path, query);
        let path = path.as_str();
        self.across(|id| async move {
            let response = self.once_raw(&Method::GET, path, None, Some(&id)).await?;
            response.bytes().await.map(|bytes| bytes.to_vec()).map_err(|_| Denied::Offline)
        })
        .await
    }

    async fn send<T: DeserializeOwned>(&self, method: Method, path: &str, body: Option<&Value>) -> Result<T, Denied> {
        let method = &method;
        self.across(|id| async move { self.once::<T>(method, path, body, Some(&id)).await }).await
    }

    async fn across<T, F, Fut>(&self, attempt: F) -> Result<T, Denied>
    where
        F: Fn(String) -> Fut,
        Fut: Future<Output = Result<T, Denied>>,
    {
        let known = self.account.lock().expect("the account lock is not poisoned").clone();
        let id = match known {
            Some(id) => id,
            None => {
                let id = self.own_account().await?;
                *self.account.lock().expect("the account lock is not poisoned") = Some(id.clone());
                id
            }
        };
        attempt(id).await
    }

    async fn own_account(&self) -> Result<String, Denied> {
        let me: Me = self.once(&Method::GET, "/me", None, None).await?;
        match <[MeAccount; 1]>::try_from(me.accounts) {
            Ok([account]) => Ok(account.id),
            Err(_) => Err(Denied::Refused(OTHER_ACCOUNT.to_string())),
        }
    }

    async fn once<T: DeserializeOwned>(
        &self,
        method: &Method,
        path: &str,
        body: Option<&Value>,
        account: Option<&str>,
    ) -> Result<T, Denied> {
        let response = self.once_raw(method, path, body, account).await?;
        response.json::<Envelope<T>>().await.map(|envelope| envelope.data).map_err(|_| Denied::Unreadable)
    }

    async fn once_raw(
        &self,
        method: &Method,
        path: &str,
        body: Option<&Value>,
        account: Option<&str>,
    ) -> Result<reqwest::Response, Denied> {
        let mut request = self.http.request(method.clone(), format!("{}{path}", engine_url())).bearer_auth(&self.held.token);
        if let Some(account) = account {
            request = request.header("x-account-id", account);
        }
        if let Some(body) = body {
            request = request.json(body);
        }
        let needed = if *method == Method::GET { Scope::Read } else { Scope::Start };
        self.finish(request, needed).await
    }

    async fn finish(&self, request: reqwest::RequestBuilder, needed: Scope) -> Result<reqwest::Response, Denied> {
        let response = request.send().await.map_err(|_| Denied::Offline)?;
        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }
        let message = response.json::<Refusal>().await.map(|refusal| refusal.error.message).unwrap_or_default();
        Err(self.denied(status, message, needed))
    }

    fn denied(&self, status: StatusCode, message: String, needed: Scope) -> Denied {
        match status {
            StatusCode::UNAUTHORIZED => {
                if !self.read_only {
                    self.tokens.forget();
                }
                Denied::Revoked
            }
            StatusCode::FORBIDDEN if message == SCOPE_REFUSED => Denied::Scope { needed, held: self.held.scope.clone() },
            StatusCode::NOT_FOUND => Denied::NotFound(message),
            status if status.is_server_error() => Denied::Offline,
            status if message.is_empty() => Denied::Refused(format!("Elise answered {status}")),
            _ => Denied::Refused(message),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{encode, with_query, Denied, EngineClient, Scope};
    use crate::store::GivenToken;

    #[test]
    fn a_scope_that_is_too_low_is_refused_before_any_request() {
        let read = GivenToken::new("read:elc_abc".to_string());
        let start = GivenToken::new("start:elc_abc".to_string());
        let unknown = GivenToken::new("elc_abc".to_string());

        assert_eq!(
            EngineClient::open(&read, true, Scope::Start).err(),
            Some(Denied::Scope { needed: Scope::Start, held: Some("read".into()) })
        );
        assert!(EngineClient::open(&read, true, Scope::Read).is_ok());
        assert!(EngineClient::open(&start, true, Scope::Start).is_ok());
        assert!(EngineClient::open(&unknown, true, Scope::Start).is_ok());
    }

    #[test]
    fn query_values_are_escaped() {
        assert_eq!(encode("a b&c"), "a%20b%26c");
        assert_eq!(with_query("/scans", &[("repoId", "r-1".into()), ("cursor", "x/y".into())]), "/scans?repoId=r-1&cursor=x%2Fy");
    }
}
