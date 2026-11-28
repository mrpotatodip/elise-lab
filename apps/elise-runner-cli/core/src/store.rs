use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const DESKTOP_KEYCHAIN_SERVICE: &str = "com.eliselab.runner";
pub const HEADLESS_KEYCHAIN_SERVICE: &str = "com.eliselab.runner.headless";

pub const HEADLESS_CLI_ACCESS_KEYCHAIN_SERVICE: &str = "com.eliselab.runner.headless.cli-access";

pub const TOKEN_VARIABLE: &str = "ELISE_RUNNER_TOKEN";

pub const CLI_ACCESS_VARIABLE: &str = "ELISE_TOKEN";

pub trait TokenStore: Send + Sync {
    fn token(&self) -> Option<String>;
    fn save(&self, token: &str) -> Result<(), StoreFailed>;
    fn forget(&self);
}

#[derive(Debug)]
pub struct StoreFailed;

const KEYCHAIN_USER: &str = "runner-token";

pub struct KeychainStore {
    service: &'static str,
    cache: Mutex<Option<String>>,
}

impl KeychainStore {
    pub const fn new(service: &'static str) -> Self {
        KeychainStore { service, cache: Mutex::new(None) }
    }

    fn entry(&self) -> keyring::Result<keyring::Entry> {
        keyring::Entry::new(self.service, KEYCHAIN_USER)
    }

    pub fn available(&self) -> bool {
        match self.entry().and_then(|entry| entry.get_password()) {
            Ok(token) => {
                *self.cache.lock().expect("the token cache is not poisoned") = Some(token);
                true
            }
            Err(keyring::Error::NoEntry) => true,
            Err(_) => false,
        }
    }

    pub fn service(&self) -> &'static str {
        self.service
    }
}

impl TokenStore for KeychainStore {
    fn token(&self) -> Option<String> {
        let mut cached = self.cache.lock().expect("the token cache is not poisoned");
        if cached.is_none() {
            *cached = self.entry().ok().and_then(|entry| entry.get_password().ok());
        }
        cached.clone()
    }

    fn save(&self, token: &str) -> Result<(), StoreFailed> {
        self.entry().and_then(|entry| entry.set_password(token)).map_err(|_| StoreFailed)?;
        *self.cache.lock().expect("the token cache is not poisoned") = Some(token.to_string());
        Ok(())
    }

    fn forget(&self) {
        *self.cache.lock().expect("the token cache is not poisoned") = None;
        if let Ok(entry) = self.entry() {
            let _ = entry.delete_credential();
        }
    }
}

pub struct FileStore {
    path: PathBuf,
}

impl FileStore {
    pub fn new(path: PathBuf) -> Self {
        FileStore { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn write_atomically(&self, token: &str) -> std::io::Result<()> {
        let folder = self.path.parent().expect("the token file has a folder");
        let mut folders = fs::DirBuilder::new();
        folders.recursive(true);
        #[cfg(unix)]
        std::os::unix::fs::DirBuilderExt::mode(&mut folders, 0o700);
        folders.create(folder)?;

        let draft = &self.path.with_extension("new");
        let _ = fs::remove_file(draft);
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        let mut file = options.open(draft)?;
        file.write_all(token.as_bytes())?;
        file.sync_all()?;
        fs::rename(draft, &self.path)
    }
}

impl TokenStore for FileStore {
    fn token(&self) -> Option<String> {
        let token = fs::read_to_string(&self.path).ok()?;
        let token = token.trim();
        (!token.is_empty()).then(|| token.to_string())
    }

    fn save(&self, token: &str) -> Result<(), StoreFailed> {
        self.write_atomically(token).map_err(|_| StoreFailed)
    }

    fn forget(&self) {
        let _ = fs::remove_file(&self.path);
    }
}

pub struct GivenToken {
    token: String,
}

impl GivenToken {
    pub fn new(token: String) -> Self {
        GivenToken { token }
    }
}

impl TokenStore for GivenToken {
    fn token(&self) -> Option<String> {
        Some(self.token.clone())
    }

    fn save(&self, _token: &str) -> Result<(), StoreFailed> {
        Err(StoreFailed)
    }

    fn forget(&self) {}
}
