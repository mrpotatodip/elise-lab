// `gitlab-sh`: a repository on a GitLab server the person's company runs. The host must be in the
// Runner's own settings on this computer: a host that only the server's job names is refused, so a
// forged job cannot send this computer to clone from somewhere else.

use super::address::{repo_path, Address};
use super::Settings;

pub(super) fn login_fix(host: &str) -> String {
    format!("Sign git in to {host}: run `glab auth login --hostname {host}` (GitLab CLI), or make a read-only token (scope read_repository) at https://{host}/-/user_settings/personal_access_tokens and give it to git's credential helper (`git config --global credential.helper`, see `git help credentials`) when git asks for a password.")
}

pub(super) fn parse(host: &str, rest: &str, settings: &Settings) -> Result<Address, String> {
    if !settings.gitlab_hosts.iter().any(|listed| listed == host) {
        let file = settings.file.as_ref().map_or("the Runner's settings file".to_string(), |file| file.display().to_string());
        let problem = settings.problem.as_ref().map_or(String::new(), |problem| format!(" That file was not used: {problem}."));
        return Err(format!(
            "This Runner does not clone from {host}: it is not in this Runner's own list of GitLab servers. To scan from it, add \"{host}\" to \"gitlabHosts\" in {file} on the Runner's computer.{problem}"
        ));
    }
    let path = repo_path(rest).ok_or_else(|| {
        format!("A GitLab address on {host} must look like https://{host}/group/name (groups inside groups are fine), with only letters, digits, '.', '_' and '-' in each part.")
    })?;
    Ok(Address { provider: "gitlab-sh", host: host.to_string(), clone_url: format!("https://{host}/{path}.git"), path })
}
