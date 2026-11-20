// The opt-in git token of a headless Runner (CI, a container), which has no keychain to hold a
// Git login. `ELISE_GIT_TOKEN` carries it. For one clone this builds a credential helper that
// answers only for the host being cloned, hands it to git through `GIT_CONFIG_*` (so no file of
// the checkout and no argument holds anything), and deletes the helper when dropped. The helper
// script holds no token: it reads it from the clone's own environment.

use std::fs;
use std::path::PathBuf;

pub const VARIABLE: &str = "ELISE_GIT_TOKEN";

// The variable the clone's environment carries the token in, for the helper to read.
const CLONE_VARIABLE: &str = "ELISE_CLONE_GIT_TOKEN";

pub struct Helper {
    folder: PathBuf,
    token: String,
    config: Vec<(String, String)>,
}

impl Helper {
    // None when no token is set. The host is the one the validated address names, a plain host
    // name, so it is safe in a shell test and in a git config key.
    pub fn for_host(scan_id: &str, host: &str) -> Result<Option<Helper>, String> {
        let Some(token) = std::env::var(VARIABLE).ok().map(|token| token.trim().to_string()).filter(|token| !token.is_empty()) else {
            return Ok(None);
        };
        let folder = std::env::temp_dir().join(format!("eliselab-git-helper-{scan_id}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        write_helper(&folder, host).map_err(|e| format!("Could not set up the git token for the clone: {e}"))?;
        let key = format!("credential.https://{host}.helper");
        // The empty value first: the token wins over any other helper, the keychain's included.
        let config = vec![(key.clone(), String::new()), (key, format!("!'{}'", folder.join("helper.sh").display()))];
        Ok(Some(Helper { folder, token, config }))
    }

    // What the clone's `git` processes are started with.
    pub fn apply(&self, command: &mut tokio::process::Command) {
        command.env("GIT_CONFIG_COUNT", self.config.len().to_string()).env(CLONE_VARIABLE, &self.token);
        for (index, (key, value)) in self.config.iter().enumerate() {
            command.env(format!("GIT_CONFIG_KEY_{index}"), key).env(format!("GIT_CONFIG_VALUE_{index}"), value);
        }
    }
}

impl Drop for Helper {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.folder);
    }
}

fn write_helper(folder: &std::path::Path, host: &str) -> std::io::Result<()> {
    let mut folders = fs::DirBuilder::new();
    folders.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut folders, 0o700);
    folders.create(folder)?;
    let script = folder.join("helper.sh");
    fs::write(
        &script,
        format!(
            "#!/bin/sh\n\
             [ \"$1\" = get ] || exit 0\n\
             while read -r line; do case \"$line\" in host=*) asked=\"${{line#host=}}\" ;; esac; done\n\
             [ \"$asked\" = \"{host}\" ] || exit 0\n\
             printf 'username=x-access-token\\npassword=%s\\n' \"${CLONE_VARIABLE}\"\n"
        ),
    )?;
    #[cfg(unix)]
    fs::set_permissions(&script, std::os::unix::fs::PermissionsExt::from_mode(0o700))?;
    Ok(())
}
