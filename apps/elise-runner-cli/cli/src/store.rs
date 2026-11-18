// Which token store this run of the headless Runner uses, in order:
// 1. `ELISE_RUNNER_TOKEN`, if set: read only.
// 2. The system keychain, under the headless Runner's own service name.
// 3. When no keychain service is available, an owner-only file in the user's config folder.
//
// A debug build reads `ELISE_RUNNER_HOME`: when set (and no `ELISE_RUNNER_TOKEN`), the store is the
// owner-only file in that folder and the keychain is never touched. That is how the tests keep away
// from a real keychain. A release build ignores it.

use elise_runner_core::store::{FileStore, GivenToken, KeychainStore, TokenStore, HEADLESS_KEYCHAIN_SERVICE};
pub use elise_runner_core::store::TOKEN_VARIABLE;
use std::path::PathBuf;

const TOKEN_FILE: &str = "token";

pub enum Where {
    Variable,
    Keychain,
    File(PathBuf),
}

pub struct Store {
    pub place: Where,
    tokens: Box<dyn TokenStore>,
}

impl Store {
    pub fn open() -> Store {
        if let Some(token) = std::env::var(TOKEN_VARIABLE).ok().filter(|token| !token.trim().is_empty()) {
            return Store { place: Where::Variable, tokens: Box::new(GivenToken::new(token.trim().to_string())) };
        }
        if let Some(home) = test_home() {
            return Store::file(home.join(TOKEN_FILE));
        }
        let keychain = KeychainStore::new(HEADLESS_KEYCHAIN_SERVICE);
        if keychain.available() {
            return Store { place: Where::Keychain, tokens: Box::new(keychain) };
        }
        let config = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        Store::file(config.join("elise-runner").join(TOKEN_FILE))
    }

    fn file(path: PathBuf) -> Store {
        Store { place: Where::File(path.clone()), tokens: Box::new(FileStore::new(path)) }
    }

    // The store the core reads, saves and forgets through.
    pub fn tokens(&self) -> &dyn TokenStore {
        self.tokens.as_ref()
    }

    // A token given from outside, which `pair` and `unpair` must not manage.
    pub fn is_read_only(&self) -> bool {
        matches!(self.place, Where::Variable)
    }

    // Where the token is, for a person to read.
    pub fn describe(&self) -> String {
        match &self.place {
            Where::Variable => format!("the {TOKEN_VARIABLE} environment variable"),
            Where::Keychain => format!("the system keychain (service {HEADLESS_KEYCHAIN_SERVICE})"),
            Where::File(path) => format!("the file {}", path.display()),
        }
    }
}

#[cfg(debug_assertions)]
pub(crate) fn test_home() -> Option<PathBuf> {
    std::env::var_os("ELISE_RUNNER_HOME").filter(|home| !home.is_empty()).map(PathBuf::from)
}

#[cfg(not(debug_assertions))]
pub(crate) fn test_home() -> Option<PathBuf> {
    None
}
