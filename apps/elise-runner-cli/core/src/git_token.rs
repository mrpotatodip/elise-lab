pub const VARIABLE: &str = "ELISE_GIT_TOKEN";

const CLONE_VARIABLE: &str = "ELISE_CLONE_GIT_TOKEN";

// What git needs to use the person's token for one host: an inline credential helper, given
// through git's own config environment. Git runs it with the shell it ships with, so no file
// is written and no `sh` has to be on the PATH. The token itself stays in an environment variable.
pub struct Helper {
    token: String,
    config: Vec<(String, String)>,
}

impl Helper {
    pub fn for_host(host: &str) -> Option<Helper> {
        let token = std::env::var(VARIABLE).ok().map(|token| token.trim().to_string()).filter(|token| !token.is_empty())?;
        let key = format!("credential.https://{host}.helper");
        let config = vec![(key.clone(), String::new()), (key, helper_command(host))];
        Some(Helper { token, config })
    }

    pub fn apply(&self, command: &mut tokio::process::Command) {
        command.env("GIT_CONFIG_COUNT", self.config.len().to_string()).env(CLONE_VARIABLE, &self.token);
        for (index, (key, value)) in self.config.iter().enumerate() {
            command.env(format!("GIT_CONFIG_KEY_{index}"), key).env(format!("GIT_CONFIG_VALUE_{index}"), value);
        }
    }
}

// Git appends ` get` (or `store`, `erase`) and runs the line with its shell. Only `get` for the one
// host is answered; the shell builtins are all it uses.
fn helper_command(host: &str) -> String {
    format!(
        "!f() {{ [ \"$1\" = get ] || exit 0; while read -r line; do case \"$line\" in host=*) asked=\"${{line#host=}}\" ;; esac; done; \
         [ \"$asked\" = \"{host}\" ] || exit 0; printf 'username=x-access-token\\npassword=%s\\n' \"${CLONE_VARIABLE}\"; }}; f"
    )
}
