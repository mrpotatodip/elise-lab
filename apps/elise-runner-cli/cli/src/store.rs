use elise_runner_core::store::{
    FileStore, GivenToken, KeychainStore, TokenStore, HEADLESS_CLI_ACCESS_KEYCHAIN_SERVICE, HEADLESS_KEYCHAIN_SERVICE,
};
pub use elise_runner_core::store::{CLI_ACCESS_VARIABLE, TOKEN_VARIABLE};
use std::path::PathBuf;

const TOKEN_FILE: &str = "token";
const CLI_ACCESS_FILE: &str = "cli-access";

pub enum TokenPlace {
    Variable,
    Keychain,
    File(PathBuf),
}

pub struct Slot {
    pub place: TokenPlace,
    tokens: Box<dyn TokenStore>,
    variable: &'static str,
    service: &'static str,
}

impl Slot {
    fn open(variable: &'static str, service: &'static str, file_name: &str) -> Slot {
        if let Some(token) = std::env::var(variable).ok().filter(|token| !token.trim().is_empty()) {
            return Slot { place: TokenPlace::Variable, tokens: Box::new(GivenToken::new(token.trim().to_string())), variable, service };
        }
        if let Some(home) = debug_only_runner_home_override() {
            return Slot::file(home.join(file_name), variable, service);
        }
        let keychain = KeychainStore::new(service);
        if keychain.available() {
            return Slot { place: TokenPlace::Keychain, tokens: Box::new(keychain), variable, service };
        }
        let config = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        Slot::file(config.join("elise-runner").join(file_name), variable, service)
    }

    fn file(path: PathBuf, variable: &'static str, service: &'static str) -> Slot {
        Slot { place: TokenPlace::File(path.clone()), tokens: Box::new(FileStore::new(path)), variable, service }
    }

    pub fn tokens(&self) -> &dyn TokenStore {
        self.tokens.as_ref()
    }

    pub fn is_read_only(&self) -> bool {
        matches!(self.place, TokenPlace::Variable)
    }

    pub fn describe(&self) -> String {
        match &self.place {
            TokenPlace::Variable => format!("the {} environment variable", self.variable),
            TokenPlace::Keychain => format!("the system keychain (service {})", self.service),
            TokenPlace::File(path) => format!("the file {}", path.display()),
        }
    }

    pub fn place_name(&self) -> &'static str {
        match self.place {
            TokenPlace::Variable => "variable",
            TokenPlace::Keychain => "keychain",
            TokenPlace::File(_) => "file",
        }
    }
}

pub struct Store {
    pub runner: Slot,
    pub access: Slot,
}

impl Store {
    pub fn open() -> Store {
        let runner = Slot::open(TOKEN_VARIABLE, HEADLESS_KEYCHAIN_SERVICE, TOKEN_FILE);
        let access = Slot::open(CLI_ACCESS_VARIABLE, HEADLESS_CLI_ACCESS_KEYCHAIN_SERVICE, CLI_ACCESS_FILE);
        Store { runner, access }
    }

    pub fn cli_access(&self) -> Option<elise_runner_core::cli_access::Held> {
        elise_runner_core::cli_access::held(self.access.tokens())
    }

    pub fn tokens(&self) -> &dyn TokenStore {
        self.runner.tokens()
    }

    pub fn is_read_only(&self) -> bool {
        self.runner.is_read_only()
    }

    pub fn describe(&self) -> String {
        self.runner.describe()
    }
}

// The Runner's own settings (the GitLab servers it may clone from), beside the token file. Only
// the person edits it: the server cannot add to it.
pub fn settings_file() -> PathBuf {
    if let Some(home) = debug_only_runner_home_override() {
        return home.join(SETTINGS_FILE);
    }
    dirs::config_dir().unwrap_or_else(|| PathBuf::from(".")).join("elise-runner").join(SETTINGS_FILE)
}

const SETTINGS_FILE: &str = "settings.json";

#[cfg(debug_assertions)]
pub(crate) fn debug_only_runner_home_override() -> Option<PathBuf> {
    std::env::var_os("ELISE_RUNNER_HOME").filter(|home| !home.is_empty()).map(PathBuf::from)
}

#[cfg(not(debug_assertions))]
pub(crate) fn debug_only_runner_home_override() -> Option<PathBuf> {
    None
}
