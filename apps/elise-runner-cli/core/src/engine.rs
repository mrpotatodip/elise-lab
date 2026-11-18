// Where Elise is, and the one HTTP client every call to it uses.

use serde::Deserialize;
use std::time::Duration;

const ENGINE_URL: &str = "https://api.eliselab.com";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

// A debug build may point at another API with ELISE_ENGINE_URL.
// A release build cannot: the token only ever goes to api.eliselab.com.
pub(crate) fn engine_url() -> String {
    #[cfg(debug_assertions)]
    if let Ok(url) = std::env::var("ELISE_ENGINE_URL") {
        return url.trim_end_matches('/').to_string();
    }
    ENGINE_URL.to_string()
}

pub(crate) fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .expect("the HTTP client settings are valid")
}

// The API wraps every answer as { data, error }.
#[derive(Deserialize)]
pub(crate) struct Envelope<T> {
    pub(crate) data: T,
}
