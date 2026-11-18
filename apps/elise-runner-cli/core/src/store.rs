// Where a Runner keeps its token. The program using the core picks the store; the core only reads,
// saves and forgets through it.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

// The keychain service names. Each program has its own, so the desktop app and the headless Runner
// on one computer are two Runners and never read or change each other's token.
pub const DESKTOP_KEYCHAIN_SERVICE: &str = "com.eliselab.runner";
pub const HEADLESS_KEYCHAIN_SERVICE: &str = "com.eliselab.runner.headless";

pub trait TokenStore: Send + Sync {
    // The token, or None when this Runner is not paired.
    fn token(&self) -> Option<String>;
    fn save(&self, token: &str) -> Result<(), StoreFailed>;
    // Drops the token. A token that is not there is already forgotten.
    fn forget(&self);
}

// The token could not be saved.
#[derive(Debug)]
pub struct StoreFailed;

const KEYCHAIN_USER: &str = "runner-token";

// The computer's keychain (macOS Keychain, Linux Secret Service), under a service name of the
// program's own, so two programs on one computer never share a token.
// The token is read from the keychain once and kept in memory: the work loop asks for it every few
// seconds, and a keychain read each time would be slow and may prompt.
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

    // Whether this computer has a keychain service to keep the token in. A Linux server often has
    // none. An entry that is simply not there yet still means the service works.
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

// A file only the owner can read, for a computer with no keychain service. Its folder is created
// owner-only too.
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

    fn write(&self, token: &str) -> std::io::Result<()> {
        let folder = self.path.parent().expect("the token file has a folder");
        let mut folders = fs::DirBuilder::new();
        folders.recursive(true);
        #[cfg(unix)]
        std::os::unix::fs::DirBuilderExt::mode(&mut folders, 0o700);
        folders.create(folder)?;

        // Written beside the file, then renamed over it, so a crash never leaves half a token.
        let draft = self.path.with_extension("new");
        let _ = fs::remove_file(&draft);
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        let mut file = options.open(&draft)?;
        file.write_all(token.as_bytes())?;
        file.sync_all()?;
        fs::rename(&draft, &self.path)
    }
}

impl TokenStore for FileStore {
    fn token(&self) -> Option<String> {
        let token = fs::read_to_string(&self.path).ok()?;
        let token = token.trim();
        (!token.is_empty()).then(|| token.to_string())
    }

    fn save(&self, token: &str) -> Result<(), StoreFailed> {
        self.write(token).map_err(|_| StoreFailed)
    }

    fn forget(&self) {
        let _ = fs::remove_file(&self.path);
    }
}

// A token given to the program from outside, such as an environment variable set from a secret.
// It is read only: the program did not save it and cannot remove it, so `save` fails and `forget`
// leaves it where it is.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_headless_runner_and_the_desktop_app_keep_their_tokens_apart() {
        assert_ne!(HEADLESS_KEYCHAIN_SERVICE, DESKTOP_KEYCHAIN_SERVICE);
    }
}
