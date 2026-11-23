pub const VARIABLE: &str = "ELISE_GIT_TOKEN";

const CLONE_VARIABLE: &str = "ELISE_CLONE_GIT_TOKEN";

pub struct Helper {
    token: String,
    config: Vec<(String, String)>,
}

impl Helper {
    pub fn for_host(host: &str) -> Option<Helper> {
        if !plain_host(host) {
            return None;
        }
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

fn plain_host(host: &str) -> bool {
    !host.is_empty() && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

fn helper_command(host: &str) -> String {
    format!(
        "!f() {{ [ \"$1\" = get ] || exit 0; while read -r line; do case \"$line\" in host=*) asked=\"${{line#host=}}\" ;; esac; done; \
         [ \"$asked\" = \"{host}\" ] || exit 0; printf 'username=x-access-token\\npassword=%s\\n' \"${CLONE_VARIABLE}\"; }}; f"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_plain_host_name_reaches_the_helper_script() {
        let cases = [
            ("github.com", true),
            ("gitlab.example-corp.com", true),
            ("", false),
            ("host\"; rm -rf ~; \"", false),
            ("a.com$(id)", false),
            ("a.com:8080", false),
            ("a b.com", false),
        ];
        for (host, accepted) in cases {
            assert_eq!(plain_host(host), accepted, "{host:?}");
        }
    }
}
