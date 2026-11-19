// Where the code of a Scan comes from (docs/adr/0008-git-providers.md). One module per provider,
// each with its own address rules, and this file, the only one that knows every provider. No
// provider module names another: `a_provider_never_names_another` fails the build when one does.
// `address` is shared ground under all of them, not a provider.

mod address;
mod github;
mod gitlab;
mod gitlab_sh;
mod upload;

use std::path::{Path, PathBuf};

pub use address::Address;

// The Runner's own settings, from a file on this computer that only the person edits. The server
// cannot add to them: a `gitlab-sh` host is cloned from only when it is listed here.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Settings {
    pub gitlab_hosts: Vec<String>,
    // The file the settings came from, named in a refusal so the person knows what to edit.
    pub file: Option<PathBuf>,
    // Why the file could not be read, when it could not: named in a refusal too.
    pub problem: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SettingsFile {
    #[serde(default)]
    gitlab_hosts: Vec<String>,
}

impl Settings {
    // A missing file is no settings. A file that does not read keeps no hosts and says why.
    pub fn load(file: &Path) -> Settings {
        let settings = Settings { file: Some(file.to_path_buf()), ..Settings::default() };
        let text = match std::fs::read_to_string(file) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return settings,
            Err(error) => return Settings { problem: Some(format!("it could not be read: {error}")), ..settings },
        };
        match serde_json::from_str::<SettingsFile>(&text) {
            Ok(read) => Settings {
                gitlab_hosts: read
                    .gitlab_hosts
                    .iter()
                    .map(|host| host.trim().to_ascii_lowercase())
                    .filter(|host| !host.is_empty())
                    .collect(),
                ..settings
            },
            Err(error) => Settings { problem: Some(format!("it is not valid: {error}")), ..settings },
        }
    }
}

// The address a job names, checked by the provider its host belongs to: github.com is `github`,
// gitlab.com is `gitlab`, and any other host is `gitlab-sh`, which takes only a host the person
// listed in their own settings. Every Err is a sentence for the dashboard.
pub fn clone_address(repo: &str, settings: &Settings) -> Result<Address, String> {
    let (host, rest) = address::split(repo)?;
    match host.as_str() {
        github::HOST => github::parse(rest),
        gitlab::HOST => gitlab::parse(rest),
        _ => gitlab_sh::parse(&host, rest, settings),
    }
}

// The job sources this Runner reads, sent with every claim: Elise hands an `archive` job (an
// upload Scan) only to a Runner that lists it.
pub const JOB_SOURCES: [&str; 2] = ["git", "archive"];

// An `archive` job (`upload`): the zip of the job this Runner claimed, downloaded into the work
// folder and unpacked as `repo`. The zip itself is removed once unpacked.
pub async fn read_archive(token: &str, scan_id: &str, work: &Path) -> Result<(), String> {
    let zip = work.join("archive.zip");
    upload::download(token, scan_id, &zip).await?;
    let unpacked = upload::unpack(&zip, &work.join("repo"));
    let _ = std::fs::remove_file(&zip);
    unpacked
}

// What a job is called in the Runner's log: the repository's path, or the address as sent when it
// does not read.
pub fn label_of(repo: &str) -> String {
    address::split(repo).ok().and_then(|(_, rest)| address::repo_path(rest)).unwrap_or_else(|| repo.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // The provider modules, by file name. A new provider is one file, one `mod` line above and one
    // name here; the layout test fails until it is listed.
    const PROVIDER_MODULES: [&str; 4] = ["github", "gitlab", "gitlab_sh", "upload"];

    // The first other provider a provider's source names as a module, if any.
    fn other_provider_named<'a>(source: &str, own: &str) -> Option<&'a str> {
        PROVIDER_MODULES.into_iter().filter(|name| *name != own).find(|name| names_module(source, name))
    }

    // The name as a whole word anywhere in the code (a path, a `use` list, an alias), outside
    // comments and string literals, where a provider may mention another's host or id.
    fn names_module(source: &str, name: &str) -> bool {
        let code = code_only(source);
        let word = |c: char| c.is_ascii_alphanumeric() || c == '_';
        code.match_indices(name).any(|(at, _)| {
            let before = code[..at].chars().next_back();
            let after = code[at + name.len()..].chars().next();
            !before.is_some_and(word) && !after.is_some_and(word)
        })
    }

    // The source with `//` comments and "…" strings blanked out.
    fn code_only(source: &str) -> String {
        let mut code = String::with_capacity(source.len());
        let mut chars = source.chars().peekable();
        while let Some(c) = chars.next() {
            match c {
                '/' if chars.peek() == Some(&'/') => {
                    while chars.next_if(|next| *next != '\n').is_some() {}
                    code.push(' ');
                }
                '"' => {
                    while let Some(inside) = chars.next() {
                        match inside {
                            '\\' => {
                                chars.next();
                            }
                            '"' => break,
                            _ => {}
                        }
                    }
                    code.push(' ');
                }
                _ => code.push(c),
            }
        }
        code
    }

    fn with_hosts(hosts: &[&str]) -> Settings {
        Settings { gitlab_hosts: hosts.iter().map(|host| host.to_string()).collect(), ..Settings::default() }
    }

    // Each provider's addresses, as a person pastes them, and the repository the Runner clones.
    #[test]
    fn an_address_resolves_to_its_provider_and_repository() {
        let settings = with_hosts(&["git.acme.dev"]);
        for (pasted, provider, host, path, clone_url) in [
            (
                "https://github.com/octocat/Hello-World",
                "github",
                "github.com",
                "octocat/Hello-World",
                "https://github.com/octocat/Hello-World",
            ),
            (
                "https://github.com/octocat/Hello-World.git",
                "github",
                "github.com",
                "octocat/Hello-World",
                "https://github.com/octocat/Hello-World.git",
            ),
            ("https://gitlab.com/acme/app", "gitlab", "gitlab.com", "acme/app", "https://gitlab.com/acme/app.git"),
            (
                "https://gitlab.com/acme/platform/team/app.git",
                "gitlab",
                "gitlab.com",
                "acme/platform/team/app",
                "https://gitlab.com/acme/platform/team/app.git",
            ),
            (
                "https://gitlab.com/acme/platform/app/-/tree/main?ref_type=heads",
                "gitlab",
                "gitlab.com",
                "acme/platform/app",
                "https://gitlab.com/acme/platform/app.git",
            ),
            ("https://gitlab.com/acme/app/", "gitlab", "gitlab.com", "acme/app", "https://gitlab.com/acme/app.git"),
            (
                "https://git.acme.dev/infra/tools/deployer",
                "gitlab-sh",
                "git.acme.dev",
                "infra/tools/deployer",
                "https://git.acme.dev/infra/tools/deployer.git",
            ),
            (
                "https://Git.Acme.Dev/infra/app/-/blob/main/README.md",
                "gitlab-sh",
                "git.acme.dev",
                "infra/app",
                "https://git.acme.dev/infra/app.git",
            ),
        ] {
            let address = clone_address(pasted, &settings).unwrap_or_else(|error| panic!("{pasted}: {error}"));
            assert_eq!(
                (address.provider, address.host.as_str(), address.path.as_str(), address.clone_url.as_str()),
                (provider, host, path, clone_url),
                "{pasted}"
            );
        }
    }

    // A forged or careless address is refused before git runs, with a sentence that says what is wrong.
    #[test]
    fn a_forged_address_is_refused_with_what_is_wrong() {
        let settings = with_hosts(&["git.acme.dev"]);
        for (forged, says) in [
            ("http://github.com/o/n", "https"),
            ("ssh://git@gitlab.com/acme/app.git", "https"),
            ("git@gitlab.com:acme/app.git", "https"),
            ("ext::sh -c touch% /tmp/x", "https"),
            ("https://user@gitlab.com/acme/app", "host"),
            ("https://gitlab.com:8443/acme/app", "host"),
            ("https://github.com/o/n/extra", "github.com/owner/name"),
            ("https://github.com/o", "github.com/owner/name"),
            ("https://gitlab.com/acme", "gitlab.com/group/name"),
            ("https://gitlab.com/acme/../app", "gitlab.com/group/name"),
            ("https://gitlab.com/acme/-app", "gitlab.com/group/name"),
            ("https://gitlab.com/acme/app;rm", "gitlab.com/group/name"),
            ("https://gitlab.com/acme/app?x=1", "gitlab.com/group/name"),
            ("https://gitlab.com/acme/a%2fb", "gitlab.com/group/name"),
            ("https://git.acme.dev/infra", "group/name"),
        ] {
            let error = clone_address(forged, &settings).err().unwrap_or_else(|| panic!("{forged} was accepted"));
            assert!(error.contains(says), "{forged}: {error}");
        }
    }

    // gitlab-sh hosts come from this computer only: a host the job alone names is refused, and the
    // refusal says which file to edit.
    #[test]
    fn a_gitlab_server_host_only_the_job_names_is_refused() {
        let settings =
            Settings { file: Some(PathBuf::from("/home/me/.config/elise-runner/settings.json")), ..with_hosts(&["git.acme.dev"]) };

        let error = clone_address("https://git.evil.example/acme/app", &settings).unwrap_err();

        assert!(error.contains("git.evil.example") && error.contains("/home/me/.config/elise-runner/settings.json"), "{error}");
        assert!(clone_address("https://git.acme.dev/acme/app", &settings).is_ok());
    }

    #[test]
    fn settings_read_the_hosts_from_the_file_and_say_why_a_bad_file_gave_none() {
        let folder = std::env::temp_dir().join(format!("elise-runner-settings-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let good = folder.join("good.json");
        let bad = folder.join("bad.json");
        std::fs::write(&good, r#"{"gitlabHosts":[" Git.Acme.Dev ",""]}"#).unwrap();
        std::fs::write(&bad, r#"{"gitlabHost":["git.acme.dev"]}"#).unwrap();

        let read = Settings::load(&good);
        let broken = Settings::load(&bad);
        let missing = Settings::load(&folder.join("none.json"));
        let _ = std::fs::remove_dir_all(&folder);

        assert_eq!((read.gitlab_hosts, read.problem), (vec!["git.acme.dev".to_string()], None));
        assert!(broken.gitlab_hosts.is_empty() && broken.problem.is_some_and(|problem| problem.contains("gitlabHost")));
        assert_eq!((missing.gitlab_hosts.len(), missing.problem), (0, None));
    }

    // One module per provider, and none names another (ADR 0008). Fails the build when a provider's
    // file uses another provider's module.
    #[test]
    fn a_provider_never_names_another() {
        let folder = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/providers");
        let mut seen = Vec::new();
        for entry in std::fs::read_dir(&folder).unwrap() {
            let path = entry.unwrap().path();
            let own = path.file_stem().unwrap().to_string_lossy().to_string();
            if !PROVIDER_MODULES.contains(&own.as_str()) {
                assert!(
                    ["mod", "address"].contains(&own.as_str()),
                    "{own}.rs is neither a provider nor shared: add it to PROVIDER_MODULES"
                );
                continue;
            }
            let source = std::fs::read_to_string(&path).unwrap();
            assert_eq!(other_provider_named(&source, &own), None, "{own}.rs names another provider");
            seen.push(own);
        }
        assert_eq!(seen.len(), PROVIDER_MODULES.len());
    }

    #[test]
    fn the_layout_check_sees_a_provider_named_in_any_form() {
        for (source, named) in [
            ("use super::gitlab::parse;", Some("gitlab")),
            ("crate::providers::gitlab_sh::parse(x)", Some("gitlab_sh")),
            ("let x = github::HOST;", Some("github")),
            ("use super::{address, gitlab};", Some("gitlab")),
            ("use super::github as g;", Some("github")),
            ("// a gitlab address\nlet mygitlab_sh = 1;\nlet s = \"gitlab-sh on gitlab.com\";", None),
        ] {
            assert_eq!(other_provider_named(source, "none"), named, "{source}");
        }
    }
}
