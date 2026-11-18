// Where a Runner keeps its token. The program using the core picks the store; the core only reads,
// saves and forgets through it.

use std::sync::Mutex;

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
