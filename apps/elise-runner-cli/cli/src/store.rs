use elise_runner_core::store::{FileStore, GivenToken, KeychainStore, TokenStore, HEADLESS_KEYCHAIN_SERVICE};
pub use elise_runner_core::store::TOKEN_VARIABLE;
use std::path::PathBuf;

const TOKEN_FILE: &str = "token";

pub enum TokenPlace {
    Variable,
    Keychain,
    File(PathBuf),
}

pub struct Store {
    pub place: TokenPlace,
    tokens: Box<dyn TokenStore>,
}

impl Store {
    pub fn open() -> Store {
        if let Some(token) = std::env::var(TOKEN_VARIABLE).ok().filter(|token| !token.trim().is_empty()) {
            return Store { place: TokenPlace::Variable, tokens: Box::new(GivenToken::new(token.trim().to_string())) };
        }
        if let Some(home) = debug_only_runner_home_override() {
            return Store::file(home.join(TOKEN_FILE));
        }
        let keychain = KeychainStore::new(HEADLESS_KEYCHAIN_SERVICE);
        if keychain.available() {
            return Store { place: TokenPlace::Keychain, tokens: Box::new(keychain) };
        }
        let config = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        Store::file(config.join("elise-runner").join(TOKEN_FILE))
    }

    fn file(path: PathBuf) -> Store {
        Store { place: TokenPlace::File(path.clone()), tokens: Box::new(FileStore::new(path)) }
    }

    pub fn tokens(&self) -> &dyn TokenStore {
        self.tokens.as_ref()
    }

    pub fn is_read_only(&self) -> bool {
        matches!(self.place, TokenPlace::Variable)
    }

    pub fn describe(&self) -> String {
        match &self.place {
            TokenPlace::Variable => format!("the {TOKEN_VARIABLE} environment variable"),
            TokenPlace::Keychain => format!("the system keychain (service {HEADLESS_KEYCHAIN_SERVICE})"),
            TokenPlace::File(path) => format!("the file {}", path.display()),
        }
    }
}

#[cfg(debug_assertions)]
pub(crate) fn debug_only_runner_home_override() -> Option<PathBuf> {
    std::env::var_os("ELISE_RUNNER_HOME").filter(|home| !home.is_empty()).map(PathBuf::from)
}

#[cfg(not(debug_assertions))]
pub(crate) fn debug_only_runner_home_override() -> Option<PathBuf> {
    None
}
